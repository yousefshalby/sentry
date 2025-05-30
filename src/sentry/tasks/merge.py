import logging
from collections.abc import Mapping
from typing import Any

from django.db import DataError, IntegrityError, router, transaction
from django.db.models import F

from sentry import eventstream, similarity, tsdb
from sentry.silo.base import SiloMode
from sentry.tasks.base import instrumented_task, track_group_async_operation
from sentry.taskworker.config import TaskworkerConfig
from sentry.taskworker.namespaces import issues_tasks
from sentry.taskworker.retry import Retry
from sentry.tsdb.base import TSDBModel

logger = logging.getLogger("sentry.merge")
delete_logger = logging.getLogger("sentry.deletions.async")


@instrumented_task(
    name="sentry.tasks.merge.merge_groups",
    queue="merge",
    default_retry_delay=60 * 5,
    max_retries=None,
    silo_mode=SiloMode.REGION,
    taskworker_config=TaskworkerConfig(
        namespace=issues_tasks,
        retry=Retry(
            delay=60 * 5,
        ),
    ),
)
@track_group_async_operation
def merge_groups(
    from_object_ids: list[int] | None = None,
    to_object_id: list[int] | None = None,
    transaction_id: int | None = None,
    recursed: bool = False,
    eventstream_state: Mapping[str, Any] | None = None,
    **kwargs,
):
    # TODO(mattrobenolt): Write tests for all of this
    from sentry.models.activity import Activity
    from sentry.models.environment import Environment
    from sentry.models.eventattachment import EventAttachment
    from sentry.models.group import Group, get_group_with_redirect
    from sentry.models.groupassignee import GroupAssignee
    from sentry.models.groupenvironment import GroupEnvironment
    from sentry.models.grouphash import GroupHash
    from sentry.models.groupmeta import GroupMeta
    from sentry.models.groupredirect import GroupRedirect
    from sentry.models.grouprulestatus import GroupRuleStatus
    from sentry.models.groupsubscription import GroupSubscription
    from sentry.models.userreport import UserReport

    if not (from_object_ids and to_object_id):
        logger.error("group.malformed.missing_params", extra={"transaction_id": transaction_id})
        return False

    # Operate on one "from" group per task iteration. The task is recursed
    # until each group has been merged.
    from_object_id = from_object_ids[0]

    try:
        new_group, _ = get_group_with_redirect(to_object_id)
    except Group.DoesNotExist:
        logger.warning(
            "group.malformed.invalid_id",
            extra={"transaction_id": transaction_id, "old_object_ids": from_object_ids},
        )
        return False

    if not recursed:
        logger.info(
            "merge.queued",
            extra={
                "transaction_id": transaction_id,
                "new_group_id": new_group.id,
                "old_group_ids": from_object_ids,
                # TODO(jtcunning): figure out why these are full seq scans and/or alternative solution
                # 'new_event_id': getattr(new_group.event_set.order_by('-id').first(), 'id', None),
                # 'old_event_id': getattr(group.event_set.order_by('-id').first(), 'id', None),
                # 'new_hash_id': getattr(new_group.grouphash_set.order_by('-id').first(), 'id', None),
                # 'old_hash_id': getattr(group.grouphash_set.order_by('-id').first(), 'id', None),
            },
        )

    try:
        group = Group.objects.select_related("project").get(id=from_object_id)
    except Group.DoesNotExist:
        from_object_ids.remove(from_object_id)

        logger.warning(
            "group.malformed.invalid_id",
            extra={"transaction_id": transaction_id, "old_object_id": from_object_id},
        )
    else:
        model_list = (
            Activity,
            GroupAssignee,
            GroupEnvironment,
            GroupHash,
            GroupRuleStatus,
            GroupSubscription,
            EventAttachment,
            UserReport,
            GroupRedirect,
            GroupMeta,
        )

        has_more = merge_objects(
            model_list, group, new_group, logger=logger, transaction_id=transaction_id
        )

        if not has_more:
            # There are no more objects to merge for *this* "from" group, remove it
            # from the list of "from" groups that are being merged, and finish the
            # work for this group.
            from_object_ids.remove(from_object_id)

            similarity.merge(group.project, new_group, [group], allow_unsafe=True)

            environment_ids = list(
                Environment.objects.filter(projects=group.project).values_list("id", flat=True)
            )

            for model in [TSDBModel.group]:
                tsdb.backend.merge(
                    model,
                    new_group.id,
                    [group.id],
                    environment_ids=(
                        environment_ids
                        if model in tsdb.backend.models_with_environment_support
                        else None
                    ),
                )

            for model in [TSDBModel.users_affected_by_group]:
                tsdb.backend.merge_distinct_counts(
                    model,
                    new_group.id,
                    [group.id],
                    environment_ids=(
                        environment_ids
                        if model in tsdb.backend.models_with_environment_support
                        else None
                    ),
                )

            for model in [
                TSDBModel.frequent_releases_by_group,
                TSDBModel.frequent_environments_by_group,
            ]:
                tsdb.backend.merge_frequencies(
                    model,
                    new_group.id,
                    [group.id],
                    environment_ids=(
                        environment_ids
                        if model in tsdb.backend.models_with_environment_support
                        else None
                    ),
                )

            previous_group_id = group.id

            with transaction.atomic(router.db_for_write(GroupRedirect)):
                GroupRedirect.create_for_group(group, new_group)
                group.delete()
            delete_logger.info(
                "object.delete.executed",
                extra={
                    "object_id": previous_group_id,
                    "transaction_id": transaction_id,
                    "model": Group.__name__,
                },
            )

            new_group.update(
                # TODO(dcramer): ideally these would be SQL clauses
                first_seen=min(group.first_seen, new_group.first_seen),
                last_seen=max(group.last_seen, new_group.last_seen),
            )
            try:
                # it's possible to hit an out of range value for counters
                new_group.update(
                    times_seen=F("times_seen") + group.times_seen,
                    num_comments=F("num_comments") + group.num_comments,
                )
            except DataError:
                pass

    if from_object_ids:
        # This task is recursed until `from_object_ids` is empty and all
        # "from" groups have merged into the `to_group_id`.
        merge_groups.delay(
            from_object_ids=from_object_ids,
            to_object_id=to_object_id,
            transaction_id=transaction_id,
            recursed=True,
            eventstream_state=eventstream_state,
        )
    elif eventstream_state:
        # All `from_object_ids` have been merged!
        eventstream.backend.end_merge(eventstream_state)


def merge_objects(models, group, new_group, limit=1000, logger=None, transaction_id=None):
    has_more = False
    for model in models:
        all_fields = [f.name for f in model._meta.get_fields()]

        # Not all models have a 'project' or 'project_id' field, but we make a best effort
        # to filter on one if it is available.
        # Also note that all_fields doesn't contain f.attname
        # (django ForeignKeys have only attribute "attname" where "_id" is implicitly appended)
        # but we still want to check for "project_id" because some models define a project_id bigint.
        has_project = "project_id" in all_fields or "project" in all_fields

        if has_project:
            project_qs = model.objects.filter(project_id=group.project_id)
        else:
            project_qs = model.objects.all()

        has_group = "group" in all_fields
        if has_group:
            queryset = project_qs.filter(group=group)
        else:
            queryset = project_qs.filter(group_id=group.id)

        for obj in queryset[:limit]:
            try:
                with transaction.atomic(using=router.db_for_write(model)):
                    if has_group:
                        project_qs.filter(id=obj.id).update(group=new_group)
                    else:
                        project_qs.filter(id=obj.id).update(group_id=new_group.id)
            except IntegrityError:
                delete = True
            else:
                delete = False

            if delete:
                # Before deleting, we want to merge in counts
                if hasattr(model, "merge_counts"):
                    obj.merge_counts(new_group)

                obj_id = obj.id
                obj.delete()

                if logger is not None:
                    delete_logger.debug(
                        "object.delete.executed",
                        extra={
                            "object_id": obj_id,
                            "transaction_id": transaction_id,
                            "model": model.__name__,
                        },
                    )
            has_more = True

        if has_more:
            return True
    return has_more
