import secrets
from datetime import timedelta
from typing import Any, TypedDict

from django.db import models
from django.utils import timezone

from bitfield import typed_dict_bitfield
from sentry.backup.dependencies import NormalizedModelName, get_model_name
from sentry.backup.sanitize import SanitizableField, Sanitizer
from sentry.backup.scopes import RelocationScope
from sentry.db.models import ArrayField, FlexibleForeignKey, Model, control_silo_model
from sentry.db.models.fields.hybrid_cloud_foreign_key import HybridCloudForeignKey

DEFAULT_EXPIRATION = timedelta(minutes=10)


class InvalidGrantError(Exception):
    pass


class ExpiredGrantError(Exception):
    pass


def default_expiration():
    return timezone.now() + DEFAULT_EXPIRATION


def generate_code():
    return secrets.token_hex(nbytes=32)  # generates a 128-bit secure token


@control_silo_model
class ApiGrant(Model):
    """
    A grant represents a token with a short lifetime that can
    be swapped for an access token, as described in :rfc:`4.1.2`
    of the OAuth 2 spec.
    """

    __relocation_scope__ = RelocationScope.Global

    user = FlexibleForeignKey("sentry.User")
    application = FlexibleForeignKey("sentry.ApiApplication")
    code = models.CharField(max_length=64, db_index=True, default=generate_code)
    expires_at = models.DateTimeField(db_index=True, default=default_expiration)
    redirect_uri = models.CharField(max_length=255)
    scopes = typed_dict_bitfield(
        TypedDict(  # type: ignore[operator]
            "scopes",
            {
                "project:read": bool,
                "project:write": bool,
                "project:admin": bool,
                "project:releases": bool,
                "team:read": bool,
                "team:write": bool,
                "team:admin": bool,
                "event:read": bool,
                "event:write": bool,
                "event:admin": bool,
                "org:read": bool,
                "org:write": bool,
                "org:admin": bool,
                "member:read": bool,
                "member:write": bool,
                "member:admin": bool,
                "openid": bool,
                "profile": bool,
                "email": bool,
            },
        )
    )
    scope_list = ArrayField(of=models.TextField)
    # API applications should ideally get access to only one organization of user
    # If null, the grant is about user level access and not org level
    organization_id = HybridCloudForeignKey(
        "sentry.Organization",
        db_index=True,
        null=True,
        on_delete="CASCADE",
    )

    class Meta:
        app_label = "sentry"
        db_table = "sentry_apigrant"

    def __str__(self):
        return (
            f"api_grant_id={self.id}, user_id={self.user.id}, application_id={self.application.id}"
        )

    def get_scopes(self):
        if self.scope_list:
            return self.scope_list
        return [k for k, v in self.scopes.items() if v]

    def has_scope(self, scope):
        return scope in self.get_scopes()

    def is_expired(self):
        return timezone.now() >= self.expires_at

    def redirect_uri_allowed(self, uri):
        return uri == self.redirect_uri

    @classmethod
    def get_lock_key(cls, grant_id):
        return f"api_grant:{grant_id}"

    @classmethod
    def sanitize_relocation_json(
        cls, json: Any, sanitizer: Sanitizer, model_name: NormalizedModelName | None = None
    ) -> None:
        model_name = get_model_name(cls) if model_name is None else model_name
        super().sanitize_relocation_json(json, sanitizer, model_name)

        sanitizer.set_string(json, SanitizableField(model_name, "code"), lambda _: generate_code())
