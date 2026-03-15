import { NextResponse } from 'next/server'
import { runPlanFeaturePipeline, extractSinglePlan, type PlanExtractionResult } from '@/lib/plan-feature-pipeline'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes — extraction is LLM-heavy

const DOCS_REPO_PATH = process.env.DOCS_REPO_PATH ?? ''

/**
 * Persist extraction results to the database.
 */
async function persistResults(results: PlanExtractionResult[]) {
  const persisted: string[] = []

  for (const result of results) {
    try {
      await prisma.extractedPlan.upsert({
        where: { sourceFile: result.sourceFile },
        create: {
          sourceFile: result.sourceFile,
          planName: result.extractedPlan.planName,
          planType: result.extractedPlan.planType,
          carrier: result.extractedPlan.carrier,
          jurisdiction: result.extractedPlan.jurisdiction,
          extractedData: JSON.parse(JSON.stringify(result.extractedPlan)) as Prisma.InputJsonValue,
          mlFeatures: JSON.parse(JSON.stringify(result.mlFeatures)) as Prisma.InputJsonValue,
          extractionConfidence: result.extractedPlan.extractionConfidence,
        },
        update: {
          planName: result.extractedPlan.planName,
          planType: result.extractedPlan.planType,
          carrier: result.extractedPlan.carrier,
          jurisdiction: result.extractedPlan.jurisdiction,
          extractedData: JSON.parse(JSON.stringify(result.extractedPlan)) as Prisma.InputJsonValue,
          mlFeatures: JSON.parse(JSON.stringify(result.mlFeatures)) as Prisma.InputJsonValue,
          extractionConfidence: result.extractedPlan.extractionConfidence,
        },
      })
      persisted.push(result.sourceFile)
    } catch (err) {
      console.error(`[plan-extract] DB persist failed for ${result.sourceFile}:`, err)
    }
  }

  return persisted
}

/**
 * POST /api/plans/extract
 *
 * Runs the full plan feature extraction pipeline across all markdown docs.
 * Optionally accepts { file: "relative/path.md" } to extract a single file.
 *
 * Returns structured plan data + ML feature vectors for every document.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { file?: string }

    // Single file mode
    if (body.file) {
      if (!DOCS_REPO_PATH) {
        return NextResponse.json({ error: 'DOCS_REPO_PATH not configured.' }, { status: 500 })
      }

      const filePath = join(DOCS_REPO_PATH, body.file)
      const content = await readFile(filePath, 'utf-8')
      const result = await extractSinglePlan(body.file, content)
      const persisted = await persistResults([result])

      return NextResponse.json({
        ok: true,
        mode: 'single',
        result,
        persisted,
      })
    }

    // Full pipeline mode
    const pipeline = await runPlanFeaturePipeline()
    const persisted = await persistResults(pipeline.results)

    return NextResponse.json({
      ok: true,
      mode: 'full',
      summary: {
        ...pipeline.summary,
        persistedCount: persisted.length,
      },
      results: pipeline.results,
      errors: pipeline.errors,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pipeline failed.'
    console.error('[plan-extract] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/plans/extract
 *
 * Returns previously extracted plans from the database + pipeline configuration.
 */
export async function GET() {
  try {
    const plans = await prisma.extractedPlan.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        sourceFile: true,
        planName: true,
        planType: true,
        carrier: true,
        jurisdiction: true,
        extractionConfidence: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      ok: true,
      docsRepoPath: DOCS_REPO_PATH || 'NOT SET',
      extractionModel: process.env.MEDICAL_EXTRACTION_MODEL ?? process.env.LLM_MODEL ?? 'qwen/qwen3-32b',
      extractedPlans: plans,
      count: plans.length,
      usage: {
        fullPipeline: 'POST /api/plans/extract with empty body or {}',
        singleFile: 'POST /api/plans/extract with { "file": "Sunlife Healthcare Plan Documents/Basic Plan.md" }',
      },
    })
  } catch {
    return NextResponse.json({
      ok: true,
      docsRepoPath: DOCS_REPO_PATH || 'NOT SET',
      extractionModel: process.env.MEDICAL_EXTRACTION_MODEL ?? process.env.LLM_MODEL ?? 'qwen/qwen3-32b',
      extractedPlans: [],
      count: 0,
      note: 'Database not available — run prisma migrate to create the extracted_plans table.',
    })
  }
}
