"use client"

import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface MarketLine {
  label: string
  data: { t: number; p: number }[]
}

const COLORS = [
  "hsl(173, 58%, 39%)",
  "hsl(43, 74%, 49%)",
  "hsl(215, 55%, 52%)",
  "hsl(0, 55%, 55%)",
  "hsl(160, 45%, 45%)",
  "hsl(28, 65%, 50%)",
  "hsl(250, 40%, 55%)",
]

const MAX_POINTS = 150

export function MarketChart({ markets }: { markets: MarketLine[] }) {
  if (markets.length === 0) return null

  const allTimestamps = new Set<number>()
  for (const m of markets) {
    for (const pt of m.data) {
      allTimestamps.add(pt.t)
    }
  }

  const sorted = Array.from(allTimestamps).sort((a, b) => a - b)

  const marketMaps = markets.map((m) => {
    const map = new Map<number, number>()
    for (const pt of m.data) {
      map.set(pt.t, Math.round(pt.p * 1000) / 10)
    }
    return { label: m.label, map }
  })

  const chartData = sorted.map((t) => {
    const row: Record<string, number> = { t }
    for (const { label, map } of marketMaps) {
      const val = map.get(t)
      if (val !== undefined) row[label] = val
    }
    return row
  })

  const labels = markets.map((m) => m.label)
  for (let i = 1; i < chartData.length; i++) {
    for (const label of labels) {
      if (chartData[i][label] === undefined && chartData[i - 1][label] !== undefined) {
        chartData[i][label] = chartData[i - 1][label]
      }
    }
  }

  const downsampledData = chartData.length <= MAX_POINTS
    ? chartData
    : (() => {
        const step = (chartData.length - 1) / (MAX_POINTS - 1)
        const result: typeof chartData = []
        for (let i = 0; i < MAX_POINTS; i++) {
          result.push(chartData[Math.round(i * step)])
        }
        return result
      })()

  const config: ChartConfig = {}
  for (let i = 0; i < markets.length; i++) {
    config[markets[i].label] = {
      label: markets[i].label,
      color: COLORS[i % COLORS.length],
    }
  }

  return (
    <ChartContainer config={config} className="aspect-[3/1] w-full">
      <LineChart data={downsampledData}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          tickFormatter={(t: number) =>
            new Date(t * 1000).toLocaleDateString("en-US", { month: "short" })
          }
          tickLine={false}
          axisLine={false}
          interval="equidistantPreserveStart"
          minTickGap={60}
        />
        <YAxis
          tickFormatter={(v: number) => `${v}%`}
          tickLine={false}
          axisLine={false}
          width={45}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t
                if (!t) return ""
                return new Date(t * 1000).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              }}
              formatter={(value) => `${value}%`}
            />
          }
        />
        <ChartLegend verticalAlign="top" align="left" content={<ChartLegendContent className="justify-start" />} />
        {markets.map((m, i) => (
          <Line
            key={m.label}
            type="monotone"
            dataKey={m.label}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
