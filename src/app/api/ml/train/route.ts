import { NextResponse } from 'next/server'
import { RandomForestClassifier } from '@/lib/ml/decision-tree'
import { generateFullTrainingDataset, type PlanSummaryForLabeling } from '@/lib/ml/training-data-generator'
import { saveModel, clearModelCache } from '@/lib/ml/plan-recommender'
import { prisma } from '@/lib/prisma'
import type { ExtractedPlanData, PlanMlFeatures } from '@/lib/plan-feature-pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for LLM-assisted label generation

/**
 * POST /api/ml/train
 *
 * Trains the decision tree classifier using:
 * 1. Patient archetypes (diverse Canadian profiles)
 * 2. Extracted plan features from the database
 * 3. LLM-generated match labels (Groq)
 *
 * The trained model is persisted to data/models/plan-recommender-forest.json
 */
export async function POST() {
  try {
    // Load extracted plans from database
    const planRows = await prisma.extractedPlan.findMany({
      select: {
        sourceFile: true,
        extractedData: true,
        mlFeatures: true,
      },
    })

    if (planRows.length === 0) {
      return NextResponse.json({
        error: 'No extracted plans in database. Run POST /api/plans/extract first.',
      }, { status: 400 })
    }

    console.log(`[ml/train] Found ${planRows.length} extracted plans`)

    // Build plan summaries and feature vectors for labeling
    const planSummaries: PlanSummaryForLabeling[] = []
    const planFeatureVectors: Record<string, Record<string, number | boolean | string>> = {}

    for (const row of planRows) {
      const extracted = row.extractedData as unknown as ExtractedPlanData
      const features = row.mlFeatures as unknown as PlanMlFeatures

      const planId = features.planId

      planSummaries.push({
        planId,
        planName: extracted.planName,
        planType: extracted.planType,
        carrier: extracted.carrier,
        jurisdiction: extracted.jurisdiction,
        summary: extracted.summary,
        coveredBenefits: extracted.benefits
          .filter((b) => b.covered)
          .map((b) => b.category),
        monthlyPremium: features.monthlyPremiumEstimate,
        deductible: features.deductible,
        coinsuranceDefault: features.coinsuranceDefault,
        exclusionCount: features.exclusionCount,
        generosity: features.overallGenerosity,
      })

      planFeatureVectors[planId] = features.featureVector
    }

    console.log('[ml/train] Generating LLM-assisted training labels...')

    // Generate training data using LLM labeling
    const trainingData = await generateFullTrainingDataset(planSummaries, planFeatureVectors)

    if (trainingData.length < 10) {
      return NextResponse.json({
        error: `Insufficient training data generated (${trainingData.length} samples). Need at least 10.`,
      }, { status: 400 })
    }

    console.log(`[ml/train] Generated ${trainingData.length} training samples`)

    // Label distribution
    const labelCounts: Record<string, number> = {}
    for (const sample of trainingData) {
      labelCounts[sample.label] = (labelCounts[sample.label] ?? 0) + 1
    }
    console.log('[ml/train] Label distribution:', labelCounts)

    // Train the random forest
    console.log('[ml/train] Training random forest...')

    const forest = new RandomForestClassifier({
      nTrees: 15,
      subsampleRatio: 0.8,
      treeConfig: {
        maxDepth: 6,
        minSamplesLeaf: 2,
        minSamplesSplit: 3,
        maxFeatures: 'sqrt',
        minImpurityDecrease: 0.005,
      },
    })

    forest.train(trainingData)

    // Save model
    clearModelCache()
    await saveModel(forest)

    console.log('[ml/train] ✓ Model trained and saved')

    // Feature importances
    const importances = forest.getFeatureImportances()
    const topFeatures = Object.entries(importances)
      .map(([feature, importance]) => ({ feature, importance: Math.round(importance * 1000) / 1000 }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20)

    return NextResponse.json({
      ok: true,
      summary: {
        plansUsed: planRows.length,
        trainingSamples: trainingData.length,
        labelDistribution: labelCounts,
        treesInForest: 15,
        topFeatures,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Training failed.'
    console.error('[ml/train] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/ml/train
 *
 * Returns current model status and configuration.
 */
export async function GET() {
  try {
    const { promises: fs } = await import('fs')
    const path = await import('path')
    const modelPath = path.join(process.cwd(), 'data', 'models', 'plan-recommender-forest.json')

    let modelExists = false
    let modelSize = 0
    let modelDate: string | null = null

    try {
      const stat = await fs.stat(modelPath)
      modelExists = true
      modelSize = stat.size
      modelDate = stat.mtime.toISOString()
    } catch {
      // Model doesn't exist yet
    }

    const planCount = await prisma.extractedPlan.count().catch(() => 0)

    return NextResponse.json({
      ok: true,
      modelExists,
      modelSizeBytes: modelSize,
      lastTrainedAt: modelDate,
      extractedPlanCount: planCount,
      readyToTrain: planCount > 0,
      usage: {
        train: 'POST /api/ml/train (requires extracted plans in DB)',
        recommend: 'POST /api/ml/recommend with user profile',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status check failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
