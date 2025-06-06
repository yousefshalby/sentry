# Generated by Django 5.1.7 on 2025-04-30 23:36

from django.db import migrations, models

import sentry.db.models.fields.bounded
from sentry.new_migrations.migrations import CheckedMigration


class Migration(CheckedMigration):
    # This flag is used to mark that a migration shouldn't be automatically run in production.
    # This should only be used for operations where it's safe to run the migration after your
    # code has deployed. So this should not be used for most operations that alter the schema
    # of a table.
    # Here are some things that make sense to mark as post deployment:
    # - Large data migrations. Typically we want these to be run manually so that they can be
    #   monitored and not block the deploy for a long period of time while they run.
    # - Adding indexes to large tables. Since this can take a long time, we'd generally prefer to
    #   run this outside deployments so that we don't block them. Note that while adding an index
    #   is a schema change, it's completely safe to run the operation after the code has deployed.
    # Once deployed, run these manually via: https://develop.sentry.dev/database-migrations/#migration-deployment

    is_post_deployment = False

    dependencies = [
        ("explore", "0002_add_starred_explore_query_model"),
        ("sentry", "0873_update_groupsearchview_visibility_default"),
    ]

    operations = [
        migrations.AddField(
            model_name="exploresavedquery",
            name="prebuilt_id",
            field=sentry.db.models.fields.bounded.BoundedPositiveIntegerField(
                db_default=None, null=True
            ),
        ),
        migrations.AddField(
            model_name="exploresavedquery",
            name="prebuilt_version",
            field=sentry.db.models.fields.bounded.BoundedPositiveIntegerField(
                db_default=None, null=True
            ),
        ),
        migrations.AddField(
            model_name="exploresavedquerystarred",
            name="starred",
            field=models.BooleanField(db_default=True),
        ),
        migrations.AlterField(
            model_name="exploresavedquerystarred",
            name="position",
            field=models.PositiveSmallIntegerField(db_default=None, null=True),
        ),
        migrations.AlterUniqueTogether(
            name="exploresavedquery",
            unique_together={("organization", "prebuilt_id")},
        ),
    ]
