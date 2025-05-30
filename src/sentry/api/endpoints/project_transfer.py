import logging
from urllib.parse import urlencode
from uuid import uuid4

from django.utils import timezone
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from sentry import audit_log, options, roles
from sentry.api.api_publish_status import ApiPublishStatus
from sentry.api.base import region_silo_endpoint
from sentry.api.bases.project import ProjectEndpoint, ProjectPermission
from sentry.api.decorators import sudo_required
from sentry.models.options.project_option import ProjectOption
from sentry.models.organizationmember import OrganizationMember
from sentry.types.ratelimit import RateLimit, RateLimitCategory
from sentry.utils.email import MessageBuilder
from sentry.utils.http import absolute_uri
from sentry.utils.signing import sign

delete_logger = logging.getLogger("sentry.deletions.api")

SALT = "sentry-project-transfer"


class RelaxedProjectPermission(ProjectPermission):
    scope_map = {"POST": ["org:admin"]}


@region_silo_endpoint
class ProjectTransferEndpoint(ProjectEndpoint):
    publish_status = {
        "POST": ApiPublishStatus.UNKNOWN,
    }
    permission_classes = (RelaxedProjectPermission,)

    enforce_rate_limit = True
    rate_limits = {
        "POST": {
            RateLimitCategory.USER: RateLimit(
                limit=3, window=60 * 60
            ),  # 3 POST requests per hour per user
        }
    }

    @sudo_required
    def post(self, request: Request, project) -> Response:
        """
        Transfer a Project
        ````````````````

        Schedules a project for transfer to a new organization.

        :pparam string organization_id_or_slug: the id or slug of the organization the
                                          project belongs to.
        :pparam string project_id_or_slug: the id or slug of the project to delete.
        :param string email: email of new owner. must be an organization owner
        :auth: required
        """
        if project.is_internal_project():
            return Response(
                '{"error": "Cannot transfer projects internally used by Sentry."}',
                status=status.HTTP_403_FORBIDDEN,
            )

        email = request.data.get("email")

        if email is None:
            return Response(status=status.HTTP_400_BAD_REQUEST)

        if not request.user.is_authenticated:
            return Response(status=status.HTTP_403_FORBIDDEN)

        all_owners = OrganizationMember.objects.get_members_by_email_and_role(
            email=email,
            role=roles.get_top_dog().id,
        )
        owners = all_owners.exclude(organization_id=project.organization_id)

        if len(all_owners) > 0 and len(owners) == 0:
            return Response(
                {"detail": "Cannot transfer project to the same organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        unique_user_ids: set[int] = {owner.user_id for owner in owners}

        if len(unique_user_ids) == 0:
            return Response(
                {"detail": "Could not find an organization owner with that email"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if len(unique_user_ids) > 1:
            return Response(
                {
                    "detail": "That email belongs to multiple accounts. Contact the person and ensure the email is associated with only one account."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        transaction_id = uuid4().hex
        url_data = sign(
            salt=SALT,
            actor_id=request.user.id,
            from_organization_id=project.organization_id,
            project_id=project.id,
            user_id=unique_user_ids.pop(),
            transaction_id=transaction_id,
        )

        ProjectOption.objects.set_value(
            project, "sentry:project-transfer-transaction-id", transaction_id
        )

        context = {
            "email": email,
            "from_org": project.organization.name,
            "project_name": project.slug,
            "request_time": timezone.now(),
            "url": absolute_uri(f"/accept-transfer/?{urlencode({'data': url_data})}"),
            "requester": request.user,
        }
        MessageBuilder(
            subject="{}Request for Project Transfer".format(options.get("mail.subject-prefix")),
            template="sentry/emails/transfer_project.txt",
            html_template="sentry/emails/transfer_project.html",
            type="org.confirm_project_transfer_request",
            context=context,
        ).send_async([email])

        self.create_audit_entry(
            request=request,
            organization=project.organization,
            target_object=project.id,
            event=audit_log.get_event_id("PROJECT_REQUEST_TRANSFER"),
            data=project.get_audit_log_data(),
            transaction_id=transaction_id,
        )

        return Response(status=status.HTTP_204_NO_CONTENT)
