"use client"

import { useMemo, useState } from "react"
import styles from "./page.module.css"
import {
  buildCsv,
  estimateRowCount,
  generateRows,
  getAvailableColumns,
  getTaskLevelColumns,
  type GanttGeneratedRow,
} from "@/lib/ganttDataGenerator"

const MAX_ROWS = 200_000

const DEFAULT_OPTIONAL_COLUMNS = ["TaskID", "Tasks", "StartDate", "EndDate", "Duration", "Progress"]

const todayAsISO = new Date().toISOString().slice(0, 10)

const downloadFile = (content: string, fileName: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const normalizePositive = (value: number, fallback: number): number => {
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback
  return normalized > 0 ? normalized : fallback
}

const getDefaultSelectedColumns = (levels: number): string[] => {
  const defaults = [...getTaskLevelColumns(levels), ...DEFAULT_OPTIONAL_COLUMNS]
  return Array.from(new Set(defaults))
}

export default function Home() {
  const [hierarchyLevels, setHierarchyLevels] = useState<number>(2)
  const [topLevelCount, setTopLevelCount] = useState<number>(51)
  const [childrenPerParentByLevel, setChildrenPerParentByLevel] = useState<number[]>([50])
  const [startDate, setStartDate] = useState<string>(todayAsISO)
  const [fileName, setFileName] = useState<string>("gantt-buckets-data")
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => getDefaultSelectedColumns(2))
  const [rows, setRows] = useState<GanttGeneratedRow[]>([])
  const [error, setError] = useState<string>("")

  const adjustedChildrenByLevel = useMemo(() => {
    return Array.from({ length: Math.max(0, hierarchyLevels - 1) }, (_, idx) => {
      return normalizePositive(childrenPerParentByLevel[idx] ?? 1, 1)
    })
  }, [childrenPerParentByLevel, hierarchyLevels])

  const estimatedRows = useMemo(() => {
    return estimateRowCount({
      hierarchyLevels: normalizePositive(hierarchyLevels, 1),
      topLevelCount: normalizePositive(topLevelCount, 1),
      childrenPerParentByLevel: adjustedChildrenByLevel,
      startDate,
    })
  }, [adjustedChildrenByLevel, hierarchyLevels, startDate, topLevelCount])

  const taskLevelColumns = useMemo(() => {
    return getTaskLevelColumns(normalizePositive(hierarchyLevels, 1))
  }, [hierarchyLevels])

  const availableColumns = useMemo(() => {
    return getAvailableColumns(normalizePositive(hierarchyLevels, 1))
  }, [hierarchyLevels])

  const selectedColumnsSet = useMemo(() => {
    return new Set(selectedColumns)
  }, [selectedColumns])

  const previewHeaders = useMemo(() => {
    if (!rows.length) return []
    return Object.keys(rows[0])
  }, [rows])

  const previewRows = useMemo(() => rows.slice(0, 20), [rows])

  const updateLevelCount = (value: number): void => {
    const safeLevelCount = normalizePositive(value, 1)
    const nextAvailableColumns = getAvailableColumns(safeLevelCount)
    const nextTaskLevelColumns = getTaskLevelColumns(safeLevelCount)

    setHierarchyLevels(safeLevelCount)
    setChildrenPerParentByLevel((prev) => {
      const nextLength = Math.max(0, safeLevelCount - 1)
      return Array.from({ length: nextLength }, (_, idx) => normalizePositive(prev[idx] ?? 2, 2))
    })

    setSelectedColumns((prev) => {
      const nextSet = new Set(prev.filter((column) => nextAvailableColumns.includes(column)))

      nextTaskLevelColumns.forEach((column) => {
        nextSet.add(column)
      })

      if (nextSet.size === 0) {
        return getDefaultSelectedColumns(safeLevelCount).filter((column) =>
          nextAvailableColumns.includes(column),
        )
      }

      return nextAvailableColumns.filter((column) => nextSet.has(column))
    })
  }

  const updateChildrenValue = (index: number, value: number): void => {
    setChildrenPerParentByLevel((prev) => {
      const next = [...prev]
      next[index] = normalizePositive(value, 1)
      return next
    })
  }

  const toggleColumn = (column: string): void => {
    setSelectedColumns((prev) => {
      const nextSet = new Set(prev)
      if (nextSet.has(column)) {
        nextSet.delete(column)
      } else {
        nextSet.add(column)
      }
      return availableColumns.filter((item) => nextSet.has(item))
    })
  }

  const selectAllColumns = (): void => {
    setSelectedColumns(availableColumns)
  }

  const clearAllColumns = (): void => {
    setSelectedColumns([])
  }

  const resetDefaultColumns = (): void => {
    const safeLevelCount = normalizePositive(hierarchyLevels, 1)
    const defaultColumns = getDefaultSelectedColumns(safeLevelCount)
    setSelectedColumns(defaultColumns.filter((column) => availableColumns.includes(column)))
  }

  const handleGenerate = (): void => {
    setError("")

    if (estimatedRows > MAX_ROWS) {
      setError(
        `Dataset is too large: ${estimatedRows.toLocaleString()} rows. Reduce settings to ${MAX_ROWS.toLocaleString()} rows or fewer.`,
      )
      return
    }

    if (selectedColumns.length === 0) {
      setError("Select at least one column for generation.")
      return
    }

    const generatedRows = generateRows({
      hierarchyLevels: normalizePositive(hierarchyLevels, 1),
      topLevelCount: normalizePositive(topLevelCount, 1),
      childrenPerParentByLevel: adjustedChildrenByLevel,
      startDate,
      selectedColumns,
    })

    setRows(generatedRows)
  }

  const handleDownloadCsv = (): void => {
    if (!rows.length) return
    const csv = buildCsv(rows)
    downloadFile(csv, `${fileName || "gantt-buckets-data"}.csv`, "text/csv;charset=utf-8")
  }

  const handleDownloadJson = (): void => {
    if (!rows.length) return
    const json = JSON.stringify(rows, null, 2)
    downloadFile(json, `${fileName || "gantt-buckets-data"}.json`, "application/json")
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1>Gantt Report Data Generator</h1>
        <p>
          AI-free test data generator for Power BI Gantt: hierarchy plus all bucket fields from
          your visual.
        </p>
      </header>

      <main className={styles.main}>
        <section className={styles.card}>
          <h2>Generation Settings</h2>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Number of hierarchy levels</span>
              <input
                type="number"
                min={1}
                value={hierarchyLevels}
                onChange={(event) => updateLevelCount(Number(event.target.value))}
              />
            </label>

            <label className={styles.field}>
              <span>Top-level item count</span>
              <input
                type="number"
                min={1}
                value={topLevelCount}
                onChange={(event) => setTopLevelCount(normalizePositive(Number(event.target.value), 1))}
              />
            </label>

            <label className={styles.field}>
              <span>Base start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value || todayAsISO)}
              />
            </label>

            <label className={styles.field}>
              <span>File name</span>
              <input
                type="text"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                placeholder="gantt-buckets-data"
              />
            </label>
          </div>

          {adjustedChildrenByLevel.length > 0 && (
            <div className={styles.childrenCard}>
              <h3>Children per parent</h3>
              <p>Set child count per one parent for each level transition.</p>

              <div className={styles.childrenGrid}>
                {adjustedChildrenByLevel.map((value, idx) => (
                  <label className={styles.field} key={`children-${idx}`}>
                    <span>
                      Level {idx + 1} → {idx + 2}
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={value}
                      onChange={(event) => updateChildrenValue(idx, Number(event.target.value))}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className={styles.infoRow}>
            <div>
              Estimated size: <b>{estimatedRows.toLocaleString()}</b> rows
            </div>
            <div>
              Tasks hierarchy columns: <b>{taskLevelColumns.join(", ")}</b>
            </div>
            <div>
              Selected columns: <b>{selectedColumns.length}</b> / {availableColumns.length}
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" onClick={handleGenerate} className={styles.primary}>
              Generate
            </button>
            <button type="button" onClick={handleDownloadCsv} disabled={!rows.length}>
              Download CSV
            </button>
            <button type="button" onClick={handleDownloadJson} disabled={!rows.length}>
              Download JSON
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <h2>Columns for Generation</h2>
          <p className={styles.muted}>
            Choose only columns that should be included in generated CSV/JSON output.
          </p>

          <div className={styles.columnActions}>
            <button type="button" onClick={selectAllColumns}>
              Select all
            </button>
            <button type="button" onClick={resetDefaultColumns}>
              Default set
            </button>
            <button type="button" onClick={clearAllColumns}>
              Clear all
            </button>
          </div>

          <div className={styles.columnsGrid}>
            {availableColumns.map((column) => (
              <label className={styles.columnOption} key={column}>
                <input
                  type="checkbox"
                  checked={selectedColumnsSet.has(column)}
                  onChange={() => toggleColumn(column)}
                />
                <span>{column}</span>
              </label>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <h2>Preview</h2>
          {!rows.length && <p>Click “Generate” to preview the table and download files.</p>}

          {rows.length > 0 && (
            <>
              <p className={styles.muted}>
                Showing {previewRows.length} of {rows.length.toLocaleString()} rows.
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {previewHeaders.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={`row-${idx}`}>
                        {previewHeaders.map((header) => (
                          <td key={`${header}-${idx}`}>{String(row[header] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
