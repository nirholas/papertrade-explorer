import { AreaSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { PortfolioHistory } from 'papertrade-sdk';

export type Metric = 'equity' | 'pnl';

export interface Point {
  time: UTCTimestamp;
  value: number;
}

/** Turn the API's columnar portfolio series into strictly ascending, de-duplicated chart points. */
export function portfolioPoints(h: Pick<PortfolioHistory, 'baseTimeMs' | 'timeOffsetsMs' | 'columns'>, metric: Metric): Point[] {
  const values = h.columns[metric] ?? [];
  const out: Point[] = [];
  let last = -1;
  for (let i = 0; i < h.timeOffsetsMs.length && i < values.length; i++) {
    const sec = Math.floor((h.baseTimeMs + h.timeOffsetsMs[i]) / 1000);
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (sec === last) out[out.length - 1].value = v;
    else if (sec > last) out.push({ time: sec as UTCTimestamp, value: v });
    last = Math.max(last, sec);
  }
  return out;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export interface AreaChart {
  setData(points: Point[]): void;
  destroy(): void;
}

/** A themed area chart that follows prefers-color-scheme and resizes with its container. */
export function areaChart(el: HTMLElement): AreaChart {
  const chart: IChartApi = createChart(el, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css('--ink-2'), fontFamily: css('--sans'), attributionLogo: true },
    grid: { vertLines: { color: css('--rule') }, horzLines: { color: css('--rule') } },
    rightPriceScale: { borderColor: css('--rule-2') },
    timeScale: { borderColor: css('--rule-2'), timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 },
    localization: { priceFormatter: (p: number) => `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}` },
  });
  const series: ISeriesApi<'Area'> = chart.addSeries(AreaSeries, { lineColor: css('--chart-line'), topColor: css('--chart-fill'), bottomColor: 'transparent', lineWidth: 2 });
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const restyle = () => {
    chart.applyOptions({
      layout: { textColor: css('--ink-2') },
      grid: { vertLines: { color: css('--rule') }, horzLines: { color: css('--rule') } },
      rightPriceScale: { borderColor: css('--rule-2') },
      timeScale: { borderColor: css('--rule-2') },
    });
    series.applyOptions({ lineColor: css('--chart-line'), topColor: css('--chart-fill') });
  };
  media.addEventListener('change', restyle);
  return {
    setData(points) {
      series.setData(points);
      chart.timeScale().fitContent();
    },
    destroy() {
      media.removeEventListener('change', restyle);
      chart.remove();
    },
  };
}
