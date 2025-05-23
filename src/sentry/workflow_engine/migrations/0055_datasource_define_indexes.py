# Generated by Django 5.1.7 on 2025-05-06 19:29

from django.db import migrations, models

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

    is_post_deployment = True

    dependencies = [
        ("sentry", "0882_projectoptions_idx_on_key"),
        ("workflow_engine", "0054_clean_up_orphaned_metric_alert_objects"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="datasource",
            index=models.Index(fields=["type", "source_id"], name="workflow_en_type_66eafc_idx"),
        ),
        migrations.AddIndex(
            model_name="datasource",
            index=models.Index(
                fields=["organization", "type", "source_id"], name="workflow_en_organiz_d71f4a_idx"
            ),
        ),
    ]
