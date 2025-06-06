import datetime
import uuid
from hashlib import md5
from itertools import cycle
from unittest.mock import patch

from sentry.issues.issue_occurrence import IssueEvidence, IssueOccurrence
from sentry.issues.producer import PayloadType
from sentry.models.group import Group, GroupStatus
from sentry.testutils.cases import UptimeTestCase
from sentry.testutils.helpers.datetime import freeze_time
from sentry.uptime.grouptype import UptimeDomainCheckFailure
from sentry.uptime.issue_platform import (
    build_detector_fingerprint_component,
    build_event_data_for_occurrence,
    build_fingerprint_for_project_subscription,
    build_occurrence_from_result,
    create_issue_platform_occurrence,
    resolve_uptime_issue,
)
from sentry.uptime.models import get_detector


class BuildDetectorFingerprintComponentTest(UptimeTestCase):
    def test_build_detector_fingerprint_component(self):
        project_subscription = self.create_project_uptime_subscription()
        detector = get_detector(project_subscription.uptime_subscription)
        assert detector

        fingerprint_component = build_detector_fingerprint_component(detector)
        assert fingerprint_component == f"uptime-detector:{detector.id}"


class BuildFingerprintForProjectSubscriptionTest(UptimeTestCase):
    def test_build_fingerprint_for_project_subscription(self):
        project_subscription = self.create_project_uptime_subscription()
        detector = get_detector(project_subscription.uptime_subscription)
        assert detector

        fingerprint = build_fingerprint_for_project_subscription(detector, project_subscription)
        expected_fingerprint = [
            build_detector_fingerprint_component(detector),
            str(project_subscription.id),
        ]
        assert fingerprint == expected_fingerprint


@freeze_time()
class CreateIssuePlatformOccurrenceTest(UptimeTestCase):
    @patch("sentry.uptime.issue_platform.produce_occurrence_to_kafka")
    @patch("sentry.uptime.issue_platform.uuid")
    def test(self, mock_uuid, mock_produce_occurrence_to_kafka):
        mock_uuid.uuid4.side_effect = cycle([uuid.uuid4(), uuid.uuid4()])
        result = self.create_uptime_result()
        project_subscription = self.create_project_uptime_subscription()
        detector = get_detector(project_subscription.uptime_subscription)
        assert detector
        create_issue_platform_occurrence(result, detector)
        assert mock_produce_occurrence_to_kafka.call_count == 1
        assert mock_produce_occurrence_to_kafka.call_args_list[0][0] == ()
        call_kwargs = mock_produce_occurrence_to_kafka.call_args_list[0][1]
        occurrence = build_occurrence_from_result(result, detector, project_subscription)
        assert call_kwargs == {
            "payload_type": PayloadType.OCCURRENCE,
            "occurrence": occurrence,
            "event_data": build_event_data_for_occurrence(result, project_subscription, occurrence),
        }


@freeze_time()
class BuildOccurrenceFromResultTest(UptimeTestCase):
    @patch("sentry.uptime.issue_platform.uuid")
    def test(self, mock_uuid):
        occurrence_id = uuid.uuid4()
        event_id = uuid.uuid4()
        mock_uuid.uuid4.side_effect = cycle([occurrence_id, event_id])
        result = self.create_uptime_result()
        project_subscription = self.create_project_uptime_subscription()
        detector = get_detector(project_subscription.uptime_subscription)
        assert detector

        assert build_occurrence_from_result(
            result, detector, project_subscription
        ) == IssueOccurrence(
            id=occurrence_id.hex,
            project_id=1,
            event_id=event_id.hex,
            fingerprint=[build_detector_fingerprint_component(detector), result["subscription_id"]],
            issue_title="Downtime detected for https://sentry.io",
            subtitle="Your monitored domain is down",
            resource_id=None,
            evidence_data={},
            evidence_display=[
                IssueEvidence(
                    name="Failure reason", value="timeout - it timed out", important=True
                ),
                IssueEvidence(name="Duration", value="100ms", important=False),
                IssueEvidence(name="Method", value="HEAD", important=False),
                IssueEvidence(name="Status Code", value="500", important=False),
            ],
            type=UptimeDomainCheckFailure,
            detection_time=datetime.datetime.now(datetime.UTC),
            level="error",
            culprit="",
            priority=None,
            assignee=None,
        )


@freeze_time()
class BuildEventDataForOccurrenceTest(UptimeTestCase):
    def test(self):
        result = self.create_uptime_result()
        project_subscription = self.create_project_uptime_subscription()
        detector = get_detector(project_subscription.uptime_subscription)
        assert detector

        event_id = uuid.uuid4()
        occurrence = IssueOccurrence(
            id=uuid.uuid4().hex,
            project_id=1,
            event_id=event_id.hex,
            fingerprint=[build_detector_fingerprint_component(detector), result["subscription_id"]],
            issue_title="Downtime detected for https://sentry.io",
            subtitle="Your monitored domain is down",
            resource_id=None,
            evidence_data={},
            evidence_display=[],
            type=UptimeDomainCheckFailure,
            detection_time=datetime.datetime.now(datetime.UTC),
            level="error",
            culprit="",
        )

        event_data = build_event_data_for_occurrence(result, project_subscription, occurrence)
        assert event_data == {
            "environment": "development",
            "event_id": event_id.hex,
            "fingerprint": [
                build_detector_fingerprint_component(detector),
                result["subscription_id"],
            ],
            "platform": "other",
            "project_id": 1,
            "received": datetime.datetime.now().replace(microsecond=0),
            "sdk": None,
            "tags": {"uptime_rule": str(project_subscription.id)},
            "timestamp": occurrence.detection_time.isoformat(),
            "contexts": {
                "trace": {"trace_id": result["trace_id"], "span_id": result.get("span_id")}
            },
        }


class ResolveUptimeIssueTest(UptimeTestCase):
    def test(self):
        subscription = self.create_uptime_subscription(subscription_id=uuid.uuid4().hex)
        project_subscription = self.create_project_uptime_subscription(
            uptime_subscription=subscription
        )
        detector = get_detector(project_subscription.uptime_subscription)
        assert detector
        result = self.create_uptime_result(subscription.subscription_id)
        with self.feature(UptimeDomainCheckFailure.build_ingest_feature_name()):
            create_issue_platform_occurrence(result, detector)
        hashed_detector_fingerprint = md5(
            build_detector_fingerprint_component(detector).encode("utf-8")
        ).hexdigest()
        hashed_subscription_fingerprint = md5(
            str(project_subscription.id).encode("utf-8")
        ).hexdigest()
        group_detector = Group.objects.get(grouphash__hash=hashed_detector_fingerprint)
        group_sub = Group.objects.get(grouphash__hash=hashed_subscription_fingerprint)
        assert group_detector.id == group_sub.id
        assert group_detector.status == GroupStatus.UNRESOLVED
        resolve_uptime_issue(detector)
        group_detector.refresh_from_db()
        assert group_detector.status == GroupStatus.RESOLVED
