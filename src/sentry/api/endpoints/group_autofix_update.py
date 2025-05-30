from __future__ import annotations

import logging

import orjson
import requests
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from rest_framework.response import Response

from sentry.api.api_owners import ApiOwner
from sentry.api.api_publish_status import ApiPublishStatus
from sentry.api.base import region_silo_endpoint
from sentry.api.bases.group import GroupAiEndpoint
from sentry.models.group import Group
from sentry.seer.seer_setup import get_seer_org_acknowledgement
from sentry.seer.signed_seer_api import sign_with_seer_secret

logger = logging.getLogger(__name__)

from rest_framework.request import Request


@region_silo_endpoint
class GroupAutofixUpdateEndpoint(GroupAiEndpoint):
    publish_status = {
        "POST": ApiPublishStatus.EXPERIMENTAL,
    }
    owner = ApiOwner.ML_AI

    def post(self, request: Request, group: Group) -> Response:
        """
        Send an update event to autofix for a given group.
        """
        if not request.data:
            return Response(status=400, data={"error": "Need a body with a run_id and payload"})

        user = request.user
        if isinstance(user, AnonymousUser):
            return Response(
                status=401,
                data={"error": "You must be authenticated to use this endpoint"},
            )

        if not get_seer_org_acknowledgement(org_id=group.organization.id):
            return Response(
                status=403,
                data={
                    "error": "Seer has not been enabled for this organization. Please open an issue at sentry.io/issues and set up Seer."
                },
            )

        path = "/v1/automation/autofix/update"

        body = orjson.dumps(
            {
                **request.data,
                "invoking_user": (
                    {
                        "id": user.id,
                        "display_name": user.get_display_name(),
                    }
                ),
            }
        )

        response = requests.post(
            f"{settings.SEER_AUTOFIX_URL}{path}",
            data=body,
            headers={
                "content-type": "application/json;charset=utf-8",
                **sign_with_seer_secret(body),
            },
        )

        response.raise_for_status()

        group.update(seer_autofix_last_triggered=timezone.now())

        return Response(status=202, data=response.json())
