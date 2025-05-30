from sentry.tasks.base import instrumented_task
from sentry.taskworker.config import TaskworkerConfig
from sentry.taskworker.namespaces import attachments_tasks


@instrumented_task(
    name="sentry.debug_files.tasks.refresh_artifact_bundles_in_use",
    queue="assemble",
    taskworker_config=TaskworkerConfig(
        namespace=attachments_tasks,
    ),
)
def refresh_artifact_bundles_in_use():
    from .artifact_bundles import refresh_artifact_bundles_in_use as do_refresh

    do_refresh()


@instrumented_task(
    name="sentry.debug_files.tasks.backfill_artifact_bundle_db_indexing",
    queue="assemble",
    taskworker_config=TaskworkerConfig(
        namespace=attachments_tasks,
    ),
)
def backfill_artifact_bundle_db_indexing(organization_id: int, release: str, dist: str):
    from .artifact_bundles import backfill_artifact_bundle_db_indexing as do_backfill

    do_backfill(organization_id, release, dist)
