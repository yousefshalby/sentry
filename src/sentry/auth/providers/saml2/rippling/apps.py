from django.apps import AppConfig


class Config(AppConfig):
    name = "sentry.auth.providers.saml2.rippling"

    def ready(self) -> None:
        from sentry.auth import register

        from .provider import RipplingSAML2Provider

        register(RipplingSAML2Provider)
