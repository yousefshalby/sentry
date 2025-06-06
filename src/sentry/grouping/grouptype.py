from dataclasses import dataclass
from typing import TypeVar

from sentry.issues.grouptype import GroupCategory, GroupType
from sentry.models.group import DEFAULT_TYPE_ID
from sentry.types.group import PriorityLevel
from sentry.workflow_engine.endpoints.validators.error_detector import ErrorDetectorValidator
from sentry.workflow_engine.handlers.detector.base import DetectorEvaluationResult, DetectorHandler
from sentry.workflow_engine.models.data_source import DataPacket
from sentry.workflow_engine.types import DetectorGroupKey, DetectorSettings

T = TypeVar("T")


class ErrorDetectorHandler(DetectorHandler):
    def evaluate(
        self, data_packet: DataPacket[T]
    ) -> dict[DetectorGroupKey, DetectorEvaluationResult]:
        # placeholder
        return {}


@dataclass(frozen=True)
class ErrorGroupType(GroupType):
    type_id = DEFAULT_TYPE_ID
    slug = "error"
    description = "Error"
    category = GroupCategory.ERROR.value
    category_v2 = GroupCategory.ERROR.value
    default_priority = PriorityLevel.MEDIUM
    released = True
    detector_settings = DetectorSettings(
        handler=ErrorDetectorHandler,
        validator=ErrorDetectorValidator,
        config_schema={"type": "object", "additionalProperties": False},
    )
