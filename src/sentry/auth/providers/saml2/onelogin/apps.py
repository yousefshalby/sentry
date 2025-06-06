from django.apps import AppConfig


class Config(AppConfig):
    name = "sentry.auth.providers.saml2.onelogin"

    def ready(self) -> None:
        from sentry.auth import register

        from .provider import OneLoginSAML2Provider

        register(OneLoginSAML2Provider)
