import unittest
from datetime import UTC, datetime
from unittest import mock
from unittest.mock import call

from sentry.issues.producer import PayloadType
from sentry.issues.status_change_message import StatusChangeMessage
from sentry.testutils.helpers.datetime import freeze_time
from sentry.types.group import PriorityLevel
from sentry.workflow_engine.handlers.detector import DetectorEvaluationResult, DetectorStateData
from sentry.workflow_engine.handlers.detector.stateful import get_redis_client
from sentry.workflow_engine.models import DataPacket, Detector, DetectorState
from sentry.workflow_engine.processors.detector import process_detectors
from sentry.workflow_engine.types import DetectorPriorityLevel
from tests.sentry.workflow_engine.handlers.detector.test_base import (
    BaseDetectorHandlerTest,
    MockDetectorStateHandler,
    build_mock_occurrence_and_event,
)


@freeze_time()
class TestProcessDetectors(BaseDetectorHandlerTest):
    def setUp(self):
        super().setUp()

    def build_data_packet(self, **kwargs):
        source_id = "1234"
        return DataPacket[dict](
            source_id, {"source_id": source_id, "group_vals": {"group_1": 6}, **kwargs}
        )

    def test(self):
        detector = self.create_detector(type=self.handler_type.slug)
        data_packet = self.build_data_packet()
        results = process_detectors(data_packet, [detector])
        assert results == [
            (
                detector,
                {None: DetectorEvaluationResult(None, True, DetectorPriorityLevel.HIGH)},
            )
        ]

    @mock.patch("sentry.workflow_engine.processors.detector.produce_occurrence_to_kafka")
    def test_state_results(self, mock_produce_occurrence_to_kafka):
        detector = self.create_detector_and_conditions(type=self.handler_state_type.slug)
        data_packet = DataPacket("1", {"dedupe": 2, "group_vals": {None: 6}})
        results = process_detectors(data_packet, [detector])

        detector_occurrence, event_data = build_mock_occurrence_and_event(
            detector.detector_handler, None, PriorityLevel.HIGH
        )

        issue_occurrence, expected_event_data = self.detector_to_issue_occurrence(
            detector_occurrence=detector_occurrence,
            detector=detector,
            group_key=None,
            value=6,
            priority=DetectorPriorityLevel.HIGH,
            detection_time=datetime.now(UTC),
            occurrence_id=str(self.mock_uuid4.return_value),
        )

        result = DetectorEvaluationResult(
            None,
            True,
            DetectorPriorityLevel.HIGH,
            issue_occurrence,
            expected_event_data,
        )
        assert results == [
            (
                detector,
                {result.group_key: result},
            )
        ]
        mock_produce_occurrence_to_kafka.assert_called_once_with(
            payload_type=PayloadType.OCCURRENCE,
            occurrence=issue_occurrence,
            status_change=None,
            event_data=expected_event_data,
        )

    @mock.patch("sentry.workflow_engine.processors.detector.produce_occurrence_to_kafka")
    def test_state_results_multi_group(self, mock_produce_occurrence_to_kafka):
        detector = self.create_detector_and_conditions(type=self.handler_state_type.slug)
        data_packet = DataPacket("1", {"dedupe": 2, "group_vals": {"group_1": 6, "group_2": 10}})
        results = process_detectors(data_packet, [detector])

        detector_occurrence_1, _ = build_mock_occurrence_and_event(
            detector.detector_handler, "group_1", PriorityLevel.HIGH
        )

        detection_time = datetime.now(UTC)
        issue_occurrence_1, event_data_1 = self.detector_to_issue_occurrence(
            detector_occurrence=detector_occurrence_1,
            detector=detector,
            group_key="group_1",
            value=6,
            priority=DetectorPriorityLevel.HIGH,
            detection_time=detection_time,
            occurrence_id=str(self.mock_uuid4.return_value),
        )

        result_1 = DetectorEvaluationResult(
            "group_1",
            True,
            DetectorPriorityLevel.HIGH,
            issue_occurrence_1,
            event_data_1,
        )

        detector_occurrence_2, _ = build_mock_occurrence_and_event(
            detector.detector_handler, "group_2", PriorityLevel.HIGH
        )

        issue_occurrence_2, event_data_2 = self.detector_to_issue_occurrence(
            detector_occurrence=detector_occurrence_2,
            detector=detector,
            group_key="group_2",
            value=10,
            priority=DetectorPriorityLevel.HIGH,
            detection_time=detection_time,
            occurrence_id=str(self.mock_uuid4.return_value),
        )

        result_2 = DetectorEvaluationResult(
            "group_2",
            True,
            DetectorPriorityLevel.HIGH,
            issue_occurrence_2,
            event_data_2,
        )
        assert results == [
            (
                detector,
                {result_1.group_key: result_1, result_2.group_key: result_2},
            )
        ]
        mock_produce_occurrence_to_kafka.assert_has_calls(
            [
                call(
                    payload_type=PayloadType.OCCURRENCE,
                    occurrence=issue_occurrence_1,
                    status_change=None,
                    event_data=event_data_1,
                ),
                call(
                    payload_type=PayloadType.OCCURRENCE,
                    occurrence=issue_occurrence_2,
                    status_change=None,
                    event_data=event_data_2,
                ),
            ],
            any_order=True,
        )

    def test_no_issue_type(self):
        detector = self.create_detector(type=self.handler_state_type.slug)
        data_packet = self.build_data_packet()
        with (
            mock.patch("sentry.workflow_engine.models.detector.logger") as mock_logger,
            mock.patch(
                "sentry.workflow_engine.models.Detector.group_type",
                return_value=None,
                new_callable=mock.PropertyMock,
            ),
        ):
            results = process_detectors(data_packet, [detector])
            assert mock_logger.error.call_args[0][0] == "No registered grouptype for detector"
        assert results == []

    def test_no_handler(self):
        detector = self.create_detector(type=self.no_handler_type.slug)
        data_packet = self.build_data_packet()
        with mock.patch("sentry.workflow_engine.models.detector.logger") as mock_logger:
            results = process_detectors(data_packet, [detector])
            assert (
                mock_logger.error.call_args[0][0]
                == "Registered grouptype for detector has no detector_handler"
            )
        assert results == []

    def test_sending_metric_before_evaluating(self):
        detector = self.create_detector(type=self.handler_type.slug)
        data_packet = self.build_data_packet()

        with mock.patch("sentry.utils.metrics.incr") as mock_incr:
            process_detectors(data_packet, [detector])

            mock_incr.assert_called_once_with(
                "workflow_engine.process_detector",
                tags={"detector_type": detector.type},
            )

    def test_sending_metric_with_results(self):
        detector = self.create_detector(type=self.update_handler_type.slug)
        data_packet = self.build_data_packet()

        with mock.patch("sentry.utils.metrics.incr") as mock_incr:
            process_detectors(data_packet, [detector])

            mock_incr.assert_any_call(
                "workflow_engine.process_detector.triggered",
                tags={"detector_type": detector.type},
            )

    def test_doesnt_send_metric(self):
        detector = self.create_detector(type=self.no_handler_type.slug)
        data_packet = self.build_data_packet()

        with mock.patch("sentry.utils.metrics.incr") as mock_incr:
            process_detectors(data_packet, [detector])
            mock_incr.assert_not_called()


class TestKeyBuilders(unittest.TestCase):
    def build_handler(self, detector: Detector | None = None) -> MockDetectorStateHandler:
        if detector is None:
            detector = Detector(id=123)
        return MockDetectorStateHandler(detector)

    def test(self):
        assert (
            self.build_handler().build_key_for_group("test", "dedupe_value")
            == "123:test:dedupe_value"
        )
        assert self.build_handler().build_key_for_group("test", "name_1") == "123:test:name_1"

    def test_different_dedupe_keys(self):
        handler = self.build_handler()
        handler_2 = self.build_handler(Detector(id=456))
        assert handler.build_key_for_group("test", "dedupe_value") != handler_2.build_key_for_group(
            "test", "dedupe_value"
        )
        assert handler.build_key_for_group("test", "dedupe_value") != handler_2.build_key_for_group(
            "test2", "dedupe_value"
        )
        assert handler.build_key_for_group("test", "dedupe_value") == handler.build_key_for_group(
            "test", "dedupe_value"
        )
        assert handler.build_key_for_group("test", "dedupe_value") != handler.build_key_for_group(
            "test_2", "dedupe_value"
        )

    def test_different_counter_value_keys(self):
        handler = self.build_handler()
        handler_2 = self.build_handler(Detector(id=456))
        assert handler.build_key_for_group("test", "name_1") != handler_2.build_key_for_group(
            "test", "name_1"
        )
        assert handler.build_key_for_group("test", "name_1") == handler.build_key_for_group(
            "test", "name_1"
        )
        assert handler.build_key_for_group("test", "name_1") != handler.build_key_for_group(
            "test2", "name_1"
        )
        assert handler.build_key_for_group("test", "name_1") != handler.build_key_for_group(
            "test", "name_2"
        )
        assert handler.build_key_for_group("test", "name_1") != handler.build_key_for_group(
            "test2", "name_2"
        )


class TestGetStateData(BaseDetectorHandlerTest):
    def test_new(self):
        handler = self.build_handler()
        key = "test_key"
        assert handler.state_manager.get_state_data([key]) == {
            key: DetectorStateData(
                key, False, DetectorPriorityLevel.OK, 0, {"test1": None, "test2": None}
            )
        }

    def test_existing(self):
        handler = self.build_handler()
        key = "test_key"
        state_data = DetectorStateData(
            key, True, DetectorPriorityLevel.OK, 10, {"test1": 5, "test2": 200}
        )
        handler.state_manager.enqueue_dedupe_update(state_data.group_key, state_data.dedupe_value)
        handler.state_manager.enqueue_counter_update(
            state_data.group_key, state_data.counter_updates
        )
        handler.state_manager.enqueue_state_update(
            state_data.group_key, state_data.is_triggered, state_data.status
        )
        handler.state_manager.commit_state_updates()
        assert handler.state_manager.get_state_data([key]) == {key: state_data}

    def test_multi(self):
        handler = self.build_handler()
        key_1 = "test_key_1"
        state_data_1 = DetectorStateData(
            key_1, True, DetectorPriorityLevel.OK, 100, {"test1": 50, "test2": 300}
        )
        handler.state_manager.enqueue_dedupe_update(key_1, state_data_1.dedupe_value)
        handler.state_manager.enqueue_counter_update(key_1, state_data_1.counter_updates)
        handler.state_manager.enqueue_state_update(
            key_1, state_data_1.is_triggered, state_data_1.status
        )

        key_2 = "test_key_2"
        state_data_2 = DetectorStateData(
            key_2, True, DetectorPriorityLevel.OK, 10, {"test1": 55, "test2": 12}
        )
        handler.state_manager.enqueue_dedupe_update(key_2, state_data_2.dedupe_value)
        handler.state_manager.enqueue_counter_update(key_2, state_data_2.counter_updates)
        handler.state_manager.enqueue_state_update(
            key_2, state_data_2.is_triggered, state_data_2.status
        )

        key_uncommitted = "test_key_uncommitted"
        state_data_uncommitted = DetectorStateData(
            key_uncommitted, False, DetectorPriorityLevel.OK, 0, {"test1": None, "test2": None}
        )
        handler.state_manager.commit_state_updates()
        assert handler.state_manager.get_state_data([key_1, key_2, key_uncommitted]) == {
            key_1: state_data_1,
            key_2: state_data_2,
            key_uncommitted: state_data_uncommitted,
        }


class TestCommitStateUpdateData(BaseDetectorHandlerTest):
    def test(self):
        handler = self.build_handler()
        redis = get_redis_client()
        group_key = None
        assert not DetectorState.objects.filter(
            detector=handler.detector, detector_group_key=group_key
        ).exists()
        dedupe_key = handler.build_key_for_group(group_key, "dedupe_value")
        counter_key_1 = handler.build_key_for_group(group_key, "some_counter")
        counter_key_2 = handler.build_key_for_group(group_key, "another_counter")

        assert not redis.exists(dedupe_key)
        assert not redis.exists(counter_key_1)
        assert not redis.exists(counter_key_2)
        handler.state_manager.enqueue_dedupe_update(group_key, 100)
        handler.state_manager.enqueue_counter_update(
            group_key, {"some_counter": 1, "another_counter": 2}
        )
        handler.state_manager.enqueue_state_update(group_key, True, DetectorPriorityLevel.OK)
        handler.state_manager.commit_state_updates()
        assert DetectorState.objects.filter(
            detector=handler.detector,
            detector_group_key=group_key,
            is_triggered=True,
            state=DetectorPriorityLevel.OK,
        ).exists()
        assert redis.get(dedupe_key) == "100"
        assert redis.get(counter_key_1) == "1"
        assert redis.get(counter_key_2) == "2"

        handler.state_manager.enqueue_dedupe_update(group_key, 150)
        handler.state_manager.enqueue_counter_update(
            group_key, {"some_counter": None, "another_counter": 20}
        )
        handler.state_manager.enqueue_state_update(group_key, False, DetectorPriorityLevel.OK)
        handler.state_manager.commit_state_updates()
        assert DetectorState.objects.filter(
            detector=handler.detector,
            detector_group_key=group_key,
            is_triggered=False,
            state=DetectorPriorityLevel.OK,
        ).exists()
        assert redis.get(dedupe_key) == "150"
        assert not redis.exists(counter_key_1)
        assert redis.get(counter_key_2) == "20"


@freeze_time()
class TestEvaluate(BaseDetectorHandlerTest):
    def test(self):
        handler = self.build_handler()
        assert handler.evaluate(DataPacket("1", {"dedupe": 1})) == {}

        detector_occurrence, _ = build_mock_occurrence_and_event(
            handler, "val1", PriorityLevel.HIGH
        )

        detection_time = datetime.now(UTC)
        issue_occurrence, event_data = self.detector_to_issue_occurrence(
            detector_occurrence=detector_occurrence,
            detector=handler.detector,
            group_key="val1",
            value=6,
            priority=DetectorPriorityLevel.HIGH,
            detection_time=detection_time,
            occurrence_id=str(self.mock_uuid4.return_value),
        )

        assert handler.evaluate(DataPacket("1", {"dedupe": 2, "group_vals": {"val1": 6}})) == {
            "val1": DetectorEvaluationResult(
                group_key="val1",
                is_triggered=True,
                priority=DetectorPriorityLevel.HIGH,
                result=issue_occurrence,
                event_data=event_data,
            )
        }

        self.assert_updates(
            handler,
            "val1",
            2,
            handler.test_get_empty_counter_state(),
            True,
            DetectorPriorityLevel.HIGH,
        )

    def test_above_below_threshold(self):
        handler = self.build_handler()
        assert handler.evaluate(DataPacket("1", {"dedupe": 1, "group_vals": {"val1": 0}})) == {}
        handler.state_manager.commit_state_updates()

        detector_occurrence, _ = build_mock_occurrence_and_event(
            handler, "val1", PriorityLevel.HIGH
        )

        detection_time = datetime.now(UTC)
        issue_occurrence, event_data = self.detector_to_issue_occurrence(
            detector_occurrence=detector_occurrence,
            detector=handler.detector,
            group_key="val1",
            value=6,
            priority=DetectorPriorityLevel.HIGH,
            detection_time=detection_time,
            occurrence_id=str(self.mock_uuid4.return_value),
        )

        assert handler.evaluate(DataPacket("1", {"dedupe": 2, "group_vals": {"val1": 6}})) == {
            "val1": DetectorEvaluationResult(
                group_key="val1",
                is_triggered=True,
                priority=DetectorPriorityLevel.HIGH,
                result=issue_occurrence,
                event_data=event_data,
            )
        }
        assert handler.evaluate(DataPacket("1", {"dedupe": 3, "group_vals": {"val1": 6}})) == {}
        assert handler.evaluate(DataPacket("1", {"dedupe": 4, "group_vals": {"val1": 0}})) == {
            "val1": DetectorEvaluationResult(
                group_key="val1",
                is_triggered=False,
                result=StatusChangeMessage(
                    fingerprint=[f"{handler.detector.id}:val1"],
                    project_id=self.project.id,
                    new_status=1,
                    new_substatus=None,
                ),
                priority=DetectorPriorityLevel.OK,
            )
        }

    def test_no_condition_group(self):
        detector = self.create_detector(type=self.handler_type.slug)
        handler = MockDetectorStateHandler(detector)
        with mock.patch(
            "sentry.workflow_engine.handlers.detector.stateful.metrics"
        ) as mock_metrics:
            assert (
                handler.evaluate(DataPacket("1", {"dedupe": 2, "group_vals": {"val1": 100}})) == {}
            )
            mock_metrics.incr.assert_called_once_with(
                "workflow_engine.detector.skipping_invalid_condition_group"
            )
            self.assert_updates(handler, "val1", 2, None, None, None)

    def test_results_on_change(self):
        handler = self.build_handler()

        detector_occurrence, _ = build_mock_occurrence_and_event(
            handler, "val1", PriorityLevel.HIGH
        )

        detection_time = datetime.now(UTC)
        issue_occurrence, event_data = self.detector_to_issue_occurrence(
            detector_occurrence=detector_occurrence,
            detector=handler.detector,
            group_key="val1",
            value=100,
            priority=DetectorPriorityLevel.HIGH,
            detection_time=detection_time,
            occurrence_id=str(self.mock_uuid4.return_value),
        )

        result = handler.evaluate(DataPacket("1", {"dedupe": 2, "group_vals": {"val1": 100}}))

        assert result == {
            "val1": DetectorEvaluationResult(
                group_key="val1",
                is_triggered=True,
                priority=DetectorPriorityLevel.HIGH,
                result=issue_occurrence,
                event_data=event_data,
            )
        }
        self.assert_updates(
            handler,
            "val1",
            2,
            handler.test_get_empty_counter_state(),
            True,
            DetectorPriorityLevel.HIGH,
        )
        # This detector is already triggered, so no status change occurred. Should be no result
        assert handler.evaluate(DataPacket("1", {"dedupe": 3, "group_vals": {"val1": 200}})) == {}

    def test_dedupe(self):
        handler = self.build_handler()

        detector_occurrence, _ = build_mock_occurrence_and_event(
            handler, "val1", PriorityLevel.HIGH
        )

        detection_time = datetime.now(UTC)
        issue_occurrence, event_data = self.detector_to_issue_occurrence(
            detector_occurrence=detector_occurrence,
            detector=handler.detector,
            group_key="val1",
            value=8,
            priority=DetectorPriorityLevel.HIGH,
            detection_time=detection_time,
            occurrence_id=str(self.mock_uuid4.return_value),
        )

        result = handler.evaluate(DataPacket("1", {"dedupe": 2, "group_vals": {"val1": 8}}))

        assert result == {
            "val1": DetectorEvaluationResult(
                group_key="val1",
                is_triggered=True,
                priority=DetectorPriorityLevel.HIGH,
                result=issue_occurrence,
                event_data=event_data,
            )
        }
        self.assert_updates(
            handler,
            "val1",
            2,
            handler.test_get_empty_counter_state(),
            True,
            DetectorPriorityLevel.HIGH,
        )
        with mock.patch(
            "sentry.workflow_engine.handlers.detector.stateful.metrics"
        ) as mock_metrics:
            assert handler.evaluate(DataPacket("1", {"dedupe": 2, "group_vals": {"val1": 0}})) == {}
            mock_metrics.incr.assert_called_once_with(
                "workflow_engine.detector.skipping_already_processed_update"
            )
        self.assert_updates(
            handler, "val1", None, handler.test_get_empty_counter_state(), None, None
        )


@freeze_time()
class TestEvaluateGroupKeyValue(BaseDetectorHandlerTest):
    def test_dedupe(self):
        handler = self.build_handler()
        with mock.patch(
            "sentry.workflow_engine.handlers.detector.stateful.metrics"
        ) as mock_metrics:
            detector_occurrence, _ = build_mock_occurrence_and_event(
                handler, "val1", PriorityLevel.HIGH
            )

            detection_time = datetime.now(UTC)
            issue_occurrence, event_data = self.detector_to_issue_occurrence(
                detector_occurrence=detector_occurrence,
                detector=handler.detector,
                group_key="group_key",
                value=10,
                priority=DetectorPriorityLevel.HIGH,
                detection_time=detection_time,
                occurrence_id=str(self.mock_uuid4.return_value),
            )

            expected_result = DetectorEvaluationResult(
                "group_key",
                True,
                DetectorPriorityLevel.HIGH,
                result=issue_occurrence,
                event_data=event_data,
            )
            assert (
                handler.evaluate_group_key_value(
                    expected_result.group_key,
                    10,
                    DetectorStateData(
                        "group_key",
                        False,
                        DetectorPriorityLevel.OK,
                        99,
                        {},
                    ),
                    dedupe_value=100,
                )
                == expected_result
            )
            assert not mock_metrics.incr.called
            assert (
                handler.evaluate_group_key_value(
                    expected_result.group_key,
                    1,
                    DetectorStateData(
                        "group_key",
                        False,
                        DetectorPriorityLevel.OK,
                        100,
                        {},
                    ),
                    dedupe_value=100,
                )
                is None
            )
            mock_metrics.incr.assert_called_once_with(
                "workflow_engine.detector.skipping_already_processed_update"
            )

    def test_status_change(self):
        handler = self.build_handler()
        assert (
            handler.evaluate_group_key_value(
                "group_key",
                0,
                DetectorStateData(
                    "group_key",
                    False,
                    DetectorPriorityLevel.OK,
                    1,
                    {},
                ),
                dedupe_value=2,
            )
            is None
        )
        assert handler.evaluate_group_key_value(
            "group_key",
            0,
            DetectorStateData(
                "group_key",
                True,
                DetectorPriorityLevel.HIGH,
                1,
                {},
            ),
            dedupe_value=2,
        ) == DetectorEvaluationResult(
            "group_key",
            False,
            DetectorPriorityLevel.OK,
            result=StatusChangeMessage(
                fingerprint=[f"{handler.detector.id}:group_key"],
                project_id=self.project.id,
                new_status=1,
                new_substatus=None,
            ),
        )
