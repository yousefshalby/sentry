import {useMemo} from 'react';
import type {vec2} from 'gl-matrix';

import {BoundTooltip} from 'sentry/components/profiling/boundTooltip';
import {t} from 'sentry/locale';
import type {CanvasView} from 'sentry/utils/profiling/canvasView';
import type {FlamegraphCanvas} from 'sentry/utils/profiling/flamegraphCanvas';
import {formatColorForSpan} from 'sentry/utils/profiling/gl/utils';
import type {SpanChartRenderer2D} from 'sentry/utils/profiling/renderers/spansRenderer';
import type {SpanChart, SpanChartNode} from 'sentry/utils/profiling/spanChart';
import {Rect} from 'sentry/utils/profiling/speedscope';

import {
  FlamegraphTooltipColorIndicator,
  FlamegraphTooltipFrameMainInfo,
  FlamegraphTooltipTimelineInfo,
} from './flamegraphTooltip';

function formatWeightToTransactionDuration(span: SpanChartNode, spanChart: SpanChart) {
  return `(${Math.round((span.duration / spanChart.root.duration) * 100)}%)`;
}

interface FlamegraphSpanTooltipProps {
  configSpaceCursor: vec2;
  hoveredNode: SpanChartNode;
  spanChart: SpanChart;
  spansCanvas: FlamegraphCanvas;
  spansRenderer: SpanChartRenderer2D;
  spansView: CanvasView<SpanChart>;
}

export function FlamegraphSpanTooltip({
  configSpaceCursor,
  spansCanvas,
  spanChart,
  spansView,
  spansRenderer,
  hoveredNode,
}: FlamegraphSpanTooltipProps) {
  const spanInConfigSpace = useMemo<Rect>(() => {
    return new Rect(
      hoveredNode.start,
      hoveredNode.end,
      hoveredNode.end - hoveredNode.start,
      1
    ).transformRect(spansView.configSpaceTransform);
  }, [spansView, hoveredNode]);

  return (
    <BoundTooltip cursor={configSpaceCursor} canvas={spansCanvas} canvasView={spansView}>
      <FlamegraphTooltipFrameMainInfo>
        <FlamegraphTooltipColorIndicator
          backgroundImage={
            hoveredNode.node.span.op === 'missing span instrumentation'
              ? `url(${spansRenderer.patternDataUrl})`
              : 'none'
          }
          backgroundColor={formatColorForSpan(hoveredNode, spansRenderer)}
        />
        {spanChart.formatter(hoveredNode.duration)}{' '}
        {formatWeightToTransactionDuration(hoveredNode, spanChart)} {hoveredNode.text}
      </FlamegraphTooltipFrameMainInfo>
      <FlamegraphTooltipTimelineInfo>
        {hoveredNode.node.span.op ? `${t('op')}:${hoveredNode.node.span.op} ` : null}
        {hoveredNode.node.span.status
          ? `${t('status')}:${hoveredNode.node.span.status}`
          : null}
      </FlamegraphTooltipTimelineInfo>
      <FlamegraphTooltipTimelineInfo>
        {spansRenderer.spanChart.timelineFormatter(spanInConfigSpace.left)} {' \u2014 '}
        {spansRenderer.spanChart.timelineFormatter(spanInConfigSpace.right)}
      </FlamegraphTooltipTimelineInfo>
    </BoundTooltip>
  );
}
