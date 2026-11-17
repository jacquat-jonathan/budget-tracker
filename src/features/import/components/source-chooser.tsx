import {
  ClipboardPasteIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { decodeCsvBytes, type CsvDecoded } from '@/features/import/csv/csv-decode'
import { formatCount } from '@/lib/money'
import { cn } from '@/lib/utils'

/** The most CSV text read at once (the import itself takes 500 rows a call). */
export const MAX_CSV_TEXT = 2_000_000

/** A CSV file as text (UTF-16, UTF-8 or Windows-1252), or why it cannot be read as text. */
async function readCsvFile(file: File): Promise<CsvDecoded> {
  return decodeCsvBytes(new Uint8Array(await file.arrayBuffer()))
}

function looksLikePdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

/**
 * Where an import starts: a PDF statement (chosen or dropped; read on this device) or a CSV
 * (a file, or text pasted). One file at a time.
 */
export function SourceChooser({
  onPdf,
  onCsv,
}: {
  onPdf: (file: File) => void
  onCsv: (text: string) => void
}) {
  const { t } = useTranslation()
  const pdfInput = useRef<HTMLInputElement>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const pasteId = useId()
  const [dragging, setDragging] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const takePdf = (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    // The reader says "not a PDF" itself; a CSV dropped here is pointed to the right place.
    if (!looksLikePdf(file) && /\.(csv|txt|tsv)$/i.test(file.name)) {
      setProblem(t('import.start.notPdf'))
      return
    }
    onPdf(file)
  }
  const takeCsv = async (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    if (looksLikePdf(file)) {
      setProblem(t('import.start.notCsv'))
      return
    }
    try {
      const decoded = await readCsvFile(file)
      if (!decoded.ok) {
        setProblem(
          decoded.reason === 'binary'
            ? t('import.start.csvBinary')
            : t('import.start.csvUndecodable'),
        )
        return
      }
      const text = decoded.text
      if (text.length > MAX_CSV_TEXT) {
        setProblem(t('import.start.csvTooLong', { max: formatCount(MAX_CSV_TEXT) }))
        return
      }
      onCsv(text)
    } catch {
      setProblem(t('import.start.readFailed'))
    }
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    takePdf(event.dataTransfer.files[0])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('import.start.title')}</h2>
        </CardTitle>
        <CardDescription className="flex items-start gap-2">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
          <span>{t('import.privacy')}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {problem && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}
        <section aria-labelledby="import-pdf-title" className="flex flex-col gap-3">
          <h3 id="import-pdf-title" className="flex items-center gap-2 font-medium">
            <FileTextIcon className="size-4 text-muted-foreground" aria-hidden />
            {t('import.start.pdf')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('import.start.pdfHelp')}</p>
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border',
            )}
            data-testid="pdf-drop"
          >
            <p className="text-sm text-muted-foreground">
              {dragging ? t('import.start.pdfDropActive') : t('import.start.pdfDrop')}
            </p>
            <Button type="button" onClick={() => pdfInput.current?.click()}>
              <FileTextIcon aria-hidden />
              {t('import.start.pdfChoose')}
            </Button>
            <input
              ref={pdfInput}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              tabIndex={-1}
              aria-label={t('import.start.pdfChoose')}
              data-testid="pdf-input"
              onChange={(event) => {
                takePdf(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <p className="text-xs text-muted-foreground">{t('import.start.oneAtATime')}</p>
          </div>
        </section>
        <section aria-labelledby="import-csv-title" className="flex flex-col gap-3">
          <h3 id="import-csv-title" className="flex items-center gap-2 font-medium">
            <FileSpreadsheetIcon className="size-4 text-muted-foreground" aria-hidden />
            {t('import.start.csv')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('import.start.csvHelp')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => csvInput.current?.click()}>
              <FileSpreadsheetIcon aria-hidden />
              {t('import.start.csvChoose')}
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-expanded={pasting}
              aria-controls={pasteId}
              onClick={() => setPasting((open) => !open)}
            >
              <ClipboardPasteIcon aria-hidden />
              {t('import.start.csvPaste')}
            </Button>
            <input
              ref={csvInput}
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="sr-only"
              tabIndex={-1}
              aria-label={t('import.start.csvChoose')}
              data-testid="csv-input"
              onChange={(event) => {
                void takeCsv(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>
          {pasting && (
            <div id={pasteId} className="flex flex-col gap-2">
              <Label htmlFor={`${pasteId}-text`}>{t('import.start.csvPasteLabel')}</Label>
              <textarea
                id={`${pasteId}-text`}
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={t('import.start.csvPastePlaceholder')}
                className="w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <div>
                <Button
                  type="button"
                  disabled={pasted.trim() === ''}
                  onClick={() => {
                    if (pasted.length > MAX_CSV_TEXT) {
                      setProblem(t('import.start.csvTooLong', { max: formatCount(MAX_CSV_TEXT) }))
                      return
                    }
                    onCsv(pasted)
                  }}
                >
                  {t('import.start.csvRead')}
                </Button>
              </div>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
