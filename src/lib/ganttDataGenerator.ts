export type PrimitiveValue = string | number

export type CustomColumnType = "date" | "string" | "number"

export interface CustomColumnDefinition {
  id: string
  name: string
  type: CustomColumnType
}

export interface MilestonesConfig {
  count: number
}

export interface GanttGeneratorConfig {
  hierarchyLevels: number
  topLevelCount: number
  childrenPerParentByLevel: number[]
  startDate: string
  selectedColumns?: string[]
  customColumns?: CustomColumnDefinition[]
  milestones?: MilestonesConfig
}

export interface GanttGeneratedRow {
  [key: string]: PrimitiveValue
}

export const DEFAULT_MILESTONES_COUNT = 1
export const MAX_MILESTONES_COUNT = 50

const CONNECT_TYPES = ["FS", "SS", "FF", "SF"] as const
const LEGEND_CATEGORIES = ["Critical", "Normal", "Low"] as const
const MILESTONE_CATEGORIES = ["Kickoff", "Review", "Delivery"] as const

const STATIC_BUCKET_COLUMNS = [
  "Tasks",
  "StartDate",
  "EndDate",
  "Duration",
  "Progress",
  "ProgressBase",
  "PlannedStartDate",
  "PlannedEndDate",
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

const STATIC_BASE_COLUMNS = ["TaskID", ...STATIC_BUCKET_COLUMNS] as const

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

const normalizeMilestonesCount = (raw: number | undefined): number => {
  const value = Math.floor(raw ?? DEFAULT_MILESTONES_COUNT)
  if (!Number.isFinite(value)) return DEFAULT_MILESTONES_COUNT
  return Math.min(MAX_MILESTONES_COUNT, Math.max(0, value))
}

export const estimateRowCount = (config: GanttGeneratorConfig): number => {
  if (config.hierarchyLevels < 1) return 0
  if (config.topLevelCount < 1) return 0

  let tasks = config.topLevelCount
  for (let i = 0; i < config.hierarchyLevels - 1; i += 1) {
    const childrenCount = config.childrenPerParentByLevel[i] ?? 0
    if (childrenCount < 1) return 0
    tasks *= childrenCount
  }
  return tasks
}

export const getTaskLevelColumns = (levels: number): string[] => {
  return Array.from({ length: levels }, (_, idx) => `Tasks_Level_${idx + 1}`)
}

export const getMilestoneColumns = (count: number): string[] => {
  const safeCount = normalizeMilestonesCount(count)
  if (safeCount <= 0) return []

  const indicators = Array.from({ length: safeCount }, (_, idx) => `Indicator_${idx + 1}`)
  const details = Array.from({ length: safeCount }, (_, idx) => `MilestoneDetails_${idx + 1}`)
  const legends = Array.from({ length: safeCount }, (_, idx) => `MilestoneLegend_${idx + 1}`)
  return [...indicators, ...details, ...legends]
}

export const getAvailableColumns = (
  levels: number,
  customColumns: CustomColumnDefinition[] = [],
  milestonesCount: number = DEFAULT_MILESTONES_COUNT,
): string[] => {
  const customNames = customColumns.map((column) => column.name).filter((name) => name.trim().length > 0)
  return [
    ...getTaskLevelColumns(levels),
    ...STATIC_BASE_COLUMNS,
    ...getMilestoneColumns(milestonesCount),
    ...customNames,
  ]
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
  const customColumns = config.customColumns ?? []
  const milestonesCount = normalizeMilestonesCount(config.milestones?.count)
  const childrenPerParentByLevel = Array.from({ length: hierarchyLevels - 1 }, (_, idx) => {
    const value = config.childrenPerParentByLevel[idx] ?? 1
    return Math.max(1, Math.floor(value))
  })

  const hierarchyPaths = buildHierarchyPaths(hierarchyLevels, topLevelCount, childrenPerParentByLevel)
  const taskLevelColumns = getTaskLevelColumns(hierarchyLevels)
  const availableColumns = getAvailableColumns(hierarchyLevels, customColumns, milestonesCount)

  const selectedColumns =
    config.selectedColumns && config.selectedColumns.length
      ? availableColumns.filter((column) => config.selectedColumns?.includes(column))
      : availableColumns

  return hierarchyPaths.map((path, taskIndex) => {
    const seed = getSeed(path, taskIndex)
    const start = addDays(startDate, seed % 365)
    const duration = 2 + (seed % 18)
    const end = addDays(start, duration)
    const plannedStart = addDays(start, -(seed % 4))
    const plannedEnd = addDays(end, seed % 5)
    const progressBase = duration + 5 + (seed % 12)
    const progress = Math.min(100, Math.round(((duration + (seed % 7)) / progressBase) * 100))
    const dynamicEventDate = addDays(start, Math.max(1, duration - 1))
    const previousTaskID = taskIndex > 0 ? `T-${String(taskIndex).padStart(6, "0")}` : ""
    const currentTaskID = `T-${String(taskIndex + 1).padStart(6, "0")}`
    const legend = LEGEND_CATEGORIES[seed % LEGEND_CATEGORIES.length]
    const taskName = buildLeafTaskName(path)

    const row: GanttGeneratedRow = {
      TaskID: currentTaskID,
      Tasks: taskName,
      StartDate: toDateOnly(start),
      EndDate: toDateOnly(end),
      Duration: duration,
      Progress: progress,
      ProgressBase: progressBase,
      PlannedStartDate: toDateOnly(plannedStart),
      PlannedEndDate: toDateOnly(plannedEnd),
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

    for (let idx = 0; idx < milestonesCount; idx += 1) {
      const offset =
        milestonesCount === 1
          ? Math.max(1, Math.floor(duration / 2))
          : Math.max(0, Math.round((duration * idx) / Math.max(1, milestonesCount - 1)))
      const milestoneDate = addDays(start, offset)
      const milestoneLegend =
        MILESTONE_CATEGORIES[(seed + idx) % MILESTONE_CATEGORIES.length]
      row[`Indicator_${idx + 1}`] = toDateOnly(milestoneDate)
      row[`MilestoneDetails_${idx + 1}`] = `Milestone ${idx + 1} ${milestoneLegend} for ${taskName}`
      row[`MilestoneLegend_${idx + 1}`] = milestoneLegend
    }

    customColumns.forEach((column, columnIndex) => {
      if (!column.name.trim()) return

      if (column.type === "number") {
        row[column.name] = (seed % 1000) + (columnIndex + 1) * 10
        return
      }

      if (column.type === "date") {
        row[column.name] = toDateOnly(addDays(startDate, (seed + (columnIndex + 1) * 9) % 730))
        return
      }

      row[column.name] = `${column.name} ${path.join(".")}`
    })

    const orderedRow: GanttGeneratedRow = {}
    selectedColumns.forEach((column) => {
      orderedRow[column] = row[column] ?? ""
    })

    return orderedRow
  })
}
