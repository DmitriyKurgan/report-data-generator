export type PrimitiveValue = string | number

export interface GanttGeneratorConfig {
  hierarchyLevels: number
  topLevelCount: number
  childrenPerParentByLevel: number[]
  startDate: string
  selectedColumns?: string[]
}

export interface GanttGeneratedRow {
  [key: string]: PrimitiveValue
}

const CONNECT_TYPES = ["FS", "SS", "FF", "SF"] as const
const LEGEND_CATEGORIES = ["Critical", "Normal", "Low"] as const
const MILESTONE_CATEGORIES = ["Kickoff", "Review", "Delivery"] as const

const BUCKET_COLUMNS = [
  "Tasks",
  "StartDate",
  "EndDate",
  "Duration",
  "Progress",
  "ProgressBase",
  "PlannedStartDate",
  "PlannedEndDate",
  "Indicators",
  "MilestoneDetails",
  "MilestoneLegend",
  "AdditionalColumns",
  "PrimaryConnectTo",
  "PrimaryConnectType",
  "TooltipFields",
  "DataLabel",
  "DynamicEvent",
  "DynamicEventLabel",
  "Conditions",
  "Legend",
] as const

const BASE_DATA_COLUMNS = ["TaskID", ...BUCKET_COLUMNS] as const

const DAY_IN_MS = 24 * 60 * 60 * 1000

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10)

const addDays = (date: Date, days: number): Date => {
  return new Date(date.getTime() + days * DAY_IN_MS)
}

const buildTaskLabel = (path: number[], level: number): string => {
  const fullKey = path
    .slice(0, level)
    .map((item) => String(item).padStart(2, "0"))
    .join(".")
  return `L${level} ${fullKey}`
}

const buildLeafTaskName = (path: number[]): string => {
  const fullKey = path.map((item) => String(item).padStart(2, "0")).join(".")
  return `Task ${fullKey}`
}

const getSeed = (path: number[], rowIndex: number): number => {
  const pathSeed = path.reduce((acc, part, index) => acc + part * (index + 11), 0)
  return pathSeed + rowIndex * 17
}

const buildHierarchyPaths = (
  hierarchyLevels: number,
  topLevelCount: number,
  childrenPerParentByLevel: number[],
): number[][] => {
  const result: number[][] = []

  const walk = (levelIndex: number, path: number[]): void => {
    const count = levelIndex === 0 ? topLevelCount : childrenPerParentByLevel[levelIndex - 1]

    for (let i = 1; i <= count; i += 1) {
      const nextPath = [...path, i]
      if (levelIndex === hierarchyLevels - 1) {
        result.push(nextPath)
      } else {
        walk(levelIndex + 1, nextPath)
      }
    }
  }

  walk(0, [])
  return result
}

export const estimateRowCount = (config: GanttGeneratorConfig): number => {
  if (config.hierarchyLevels < 1) return 0
  if (config.topLevelCount < 1) return 0

  let total = config.topLevelCount
  for (let i = 0; i < config.hierarchyLevels - 1; i += 1) {
    const childrenCount = config.childrenPerParentByLevel[i] ?? 0
    if (childrenCount < 1) return 0
    total *= childrenCount
  }
  return total
}

export const getTaskLevelColumns = (levels: number): string[] => {
  return Array.from({ length: levels }, (_, idx) => `Tasks_Level_${idx + 1}`)
}

export const getAvailableColumns = (levels: number): string[] => {
  return [...getTaskLevelColumns(levels), ...BASE_DATA_COLUMNS]
}

export const buildCsv = (rows: GanttGeneratedRow[]): string => {
  if (!rows.length) return ""

  const headers = Object.keys(rows[0])
  const escapeCsvCell = (value: PrimitiveValue): string => {
    const asString = String(value ?? "")
    if (/[",\n\r]/.test(asString)) {
      return `"${asString.replace(/"/g, '""')}"`
    }
    return asString
  }

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header] ?? "")).join(",")),
  ]

  return lines.join("\n")
}

export const generateRows = (config: GanttGeneratorConfig): GanttGeneratedRow[] => {
  const hierarchyLevels = Math.max(1, Math.floor(config.hierarchyLevels))
  const topLevelCount = Math.max(1, Math.floor(config.topLevelCount))
  const startDate = new Date(config.startDate || "2026-01-01")
  const childrenPerParentByLevel = Array.from({ length: hierarchyLevels - 1 }, (_, idx) => {
    const value = config.childrenPerParentByLevel[idx] ?? 1
    return Math.max(1, Math.floor(value))
  })

  const hierarchyPaths = buildHierarchyPaths(hierarchyLevels, topLevelCount, childrenPerParentByLevel)
  const taskLevelColumns = getTaskLevelColumns(hierarchyLevels)
  const availableColumns = getAvailableColumns(hierarchyLevels)

  const selectedColumns =
    config.selectedColumns && config.selectedColumns.length
      ? availableColumns.filter((column) => config.selectedColumns?.includes(column))
      : availableColumns

  return hierarchyPaths.map((path, rowIndex) => {
    const seed = getSeed(path, rowIndex)
    const start = addDays(startDate, seed % 365)
    const duration = 2 + (seed % 18)
    const end = addDays(start, duration)
    const plannedStart = addDays(start, -(seed % 4))
    const plannedEnd = addDays(end, seed % 5)
    const progressBase = duration + 5 + (seed % 12)
    const progress = Math.min(100, Math.round(((duration + (seed % 7)) / progressBase) * 100))
    const indicatorDate = addDays(start, Math.max(1, Math.floor(duration / 2)))
    const dynamicEventDate = addDays(start, Math.max(1, duration - 1))
    const previousTaskID = rowIndex > 0 ? `T-${String(rowIndex).padStart(6, "0")}` : ""
    const currentTaskID = `T-${String(rowIndex + 1).padStart(6, "0")}`
    const milestoneLegend = MILESTONE_CATEGORIES[seed % MILESTONE_CATEGORIES.length]
    const legend = LEGEND_CATEGORIES[seed % LEGEND_CATEGORIES.length]

    const row: GanttGeneratedRow = {
      TaskID: currentTaskID,
      Tasks: buildLeafTaskName(path),
      StartDate: toDateOnly(start),
      EndDate: toDateOnly(end),
      Duration: duration,
      Progress: progress,
      ProgressBase: progressBase,
      PlannedStartDate: toDateOnly(plannedStart),
      PlannedEndDate: toDateOnly(plannedEnd),
      Indicators: `${toDateOnly(indicatorDate)}|${milestoneLegend}`,
      MilestoneDetails: `Milestone ${milestoneLegend} for ${buildLeafTaskName(path)}`,
      MilestoneLegend: milestoneLegend,
      AdditionalColumns: `Owner ${(seed % 15) + 1}`,
      PrimaryConnectTo: previousTaskID,
      PrimaryConnectType: CONNECT_TYPES[seed % CONNECT_TYPES.length],
      TooltipFields: `Path ${path.join(".")} | Duration ${duration}d`,
      DataLabel: `${progress}%`,
      DynamicEvent: toDateOnly(dynamicEventDate),
      DynamicEventLabel: `Event ${(seed % 9) + 1}`,
      Conditions: (seed % 101) / 100,
      Legend: legend,
    }

    taskLevelColumns.forEach((column, idx) => {
      row[column] = buildTaskLabel(path, idx + 1)
    })

    const orderedRow: GanttGeneratedRow = {}
    selectedColumns.forEach((column) => {
      orderedRow[column] = row[column]
    })

    return orderedRow
  })
}
