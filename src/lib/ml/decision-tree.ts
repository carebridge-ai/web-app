/**
 * Decision Tree Classifier — pure TypeScript implementation.
 *
 * Supports:
 * - Binary splits on numeric features (threshold-based)
 * - Binary splits on boolean features
 * - Multi-class classification with probability estimates
 * - Feature importance tracking
 * - Serialization to/from JSON for persistence
 * - Explainable predictions (decision path)
 */

export type FeatureVector = Record<string, number | boolean>

export type TrainingSample = {
  features: FeatureVector
  label: string
  weight?: number
}

type SplitCandidate = {
  feature: string
  threshold: number | null // null = boolean split
  gini: number
  leftCount: number
  rightCount: number
}

type TreeNode = {
  type: 'leaf'
  classCounts: Record<string, number>
  totalSamples: number
  prediction: string
  confidence: number
} | {
  type: 'split'
  feature: string
  threshold: number | null
  left: TreeNode
  right: TreeNode
  totalSamples: number
  improvement: number
}

export type DecisionPath = {
  feature: string
  threshold: number | null
  direction: 'left' | 'right'
  description: string
}[]

export type PredictionResult = {
  prediction: string
  confidence: number
  classProbabilities: Record<string, number>
  decisionPath: DecisionPath
}

export type TreeConfig = {
  maxDepth?: number
  minSamplesLeaf?: number
  minSamplesSplit?: number
  maxFeatures?: number | 'sqrt' | 'all'
  minImpurityDecrease?: number
}

const DEFAULT_CONFIG: Required<TreeConfig> = {
  maxDepth: 8,
  minSamplesLeaf: 2,
  minSamplesSplit: 4,
  maxFeatures: 'sqrt',
  minImpurityDecrease: 0.001,
}

// ---------------------------------------------------------------------------
// Gini impurity calculation
// ---------------------------------------------------------------------------

function giniImpurity(counts: Record<string, number>, total: number): number {
  if (total === 0) return 0
  let sumSquares = 0
  for (const label in counts) {
    const p = counts[label] / total
    sumSquares += p * p
  }
  return 1 - sumSquares
}

function countLabels(samples: TrainingSample[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of samples) {
    const w = s.weight ?? 1
    counts[s.label] = (counts[s.label] ?? 0) + w
  }
  return counts
}

function weightedTotal(samples: TrainingSample[]): number {
  return samples.reduce((sum, s) => sum + (s.weight ?? 1), 0)
}

// ---------------------------------------------------------------------------
// Feature encoding: convert mixed types to numeric for splitting
// ---------------------------------------------------------------------------

function encodeFeatureValue(value: number | boolean | undefined): number {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value
  return 0
}

// ---------------------------------------------------------------------------
// Decision Tree Classifier
// ---------------------------------------------------------------------------

export class DecisionTreeClassifier {
  private root: TreeNode | null = null
  private config: Required<TreeConfig>
  private featureNames: string[] = []
  private featureImportances: Record<string, number> = {}
  private classes: string[] = []

  constructor(config: TreeConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // -------------------------------------------------------------------------
  // Training
  // -------------------------------------------------------------------------

  train(samples: TrainingSample[]): void {
    if (samples.length === 0) throw new Error('No training samples provided')

    // Collect all feature names
    const featureSet = new Set<string>()
    for (const s of samples) {
      for (const key of Object.keys(s.features)) {
        featureSet.add(key)
      }
    }
    this.featureNames = [...featureSet]

    // Collect all classes
    const classSet = new Set<string>()
    for (const s of samples) classSet.add(s.label)
    this.classes = [...classSet].sort()

    // Initialize feature importances
    this.featureImportances = {}
    for (const f of this.featureNames) this.featureImportances[f] = 0

    // Build tree recursively
    this.root = this.buildNode(samples, 0)

    // Normalize feature importances
    const totalImportance = Object.values(this.featureImportances).reduce((a, b) => a + b, 0)
    if (totalImportance > 0) {
      for (const f in this.featureImportances) {
        this.featureImportances[f] /= totalImportance
      }
    }
  }

  private selectFeatures(): string[] {
    const { maxFeatures } = this.config
    if (maxFeatures === 'all') return this.featureNames

    const k = maxFeatures === 'sqrt'
      ? Math.max(1, Math.floor(Math.sqrt(this.featureNames.length)))
      : Math.min(maxFeatures, this.featureNames.length)

    // Random subset selection
    const shuffled = [...this.featureNames]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, k)
  }

  private buildNode(samples: TrainingSample[], depth: number): TreeNode {
    const total = weightedTotal(samples)
    const counts = countLabels(samples)
    const currentGini = giniImpurity(counts, total)

    // Leaf conditions
    if (
      depth >= this.config.maxDepth ||
      samples.length < this.config.minSamplesSplit ||
      currentGini === 0 // pure node
    ) {
      return this.createLeaf(counts, total)
    }

    // Find best split
    const candidateFeatures = this.selectFeatures()
    let bestSplit: SplitCandidate | null = null

    for (const feature of candidateFeatures) {
      const split = this.findBestSplit(samples, feature, total, currentGini)
      if (split && (!bestSplit || split.gini < bestSplit.gini)) {
        bestSplit = split
      }
    }

    // No valid split found or improvement too small
    if (!bestSplit) {
      return this.createLeaf(counts, total)
    }

    const improvement = currentGini - bestSplit.gini
    if (improvement < this.config.minImpurityDecrease) {
      return this.createLeaf(counts, total)
    }

    // Partition samples
    const { left, right } = this.partition(samples, bestSplit.feature, bestSplit.threshold)

    if (left.length < this.config.minSamplesLeaf || right.length < this.config.minSamplesLeaf) {
      return this.createLeaf(counts, total)
    }

    // Track feature importance
    this.featureImportances[bestSplit.feature] += improvement * total

    return {
      type: 'split',
      feature: bestSplit.feature,
      threshold: bestSplit.threshold,
      left: this.buildNode(left, depth + 1),
      right: this.buildNode(right, depth + 1),
      totalSamples: samples.length,
      improvement,
    }
  }

  private findBestSplit(
    samples: TrainingSample[],
    feature: string,
    total: number,
    parentGini: number,
  ): SplitCandidate | null {
    // Get unique values for this feature
    const values = samples.map((s) => encodeFeatureValue(s.features[feature]))
    const uniqueValues = [...new Set(values)].sort((a, b) => a - b)

    if (uniqueValues.length <= 1) return null

    // Check if this is a boolean feature
    const isBooleanFeature = uniqueValues.length === 2 &&
      uniqueValues[0] === 0 && uniqueValues[1] === 1

    let bestGini = parentGini
    let bestThreshold: number | null = null

    if (isBooleanFeature) {
      // Boolean split: left = false (0), right = true (1)
      const leftCounts: Record<string, number> = {}
      const rightCounts: Record<string, number> = {}
      let leftTotal = 0
      let rightTotal = 0

      for (const s of samples) {
        const val = encodeFeatureValue(s.features[feature])
        const w = s.weight ?? 1
        if (val === 0) {
          leftCounts[s.label] = (leftCounts[s.label] ?? 0) + w
          leftTotal += w
        } else {
          rightCounts[s.label] = (rightCounts[s.label] ?? 0) + w
          rightTotal += w
        }
      }

      const weightedGini =
        (leftTotal / total) * giniImpurity(leftCounts, leftTotal) +
        (rightTotal / total) * giniImpurity(rightCounts, rightTotal)

      if (weightedGini < bestGini) {
        bestGini = weightedGini
        bestThreshold = null // marks boolean split
      }
    } else {
      // Numeric: try midpoints between unique sorted values
      for (let i = 0; i < uniqueValues.length - 1; i++) {
        const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2

        const leftCounts: Record<string, number> = {}
        const rightCounts: Record<string, number> = {}
        let leftTotal = 0
        let rightTotal = 0

        for (const s of samples) {
          const val = encodeFeatureValue(s.features[feature])
          const w = s.weight ?? 1
          if (val <= threshold) {
            leftCounts[s.label] = (leftCounts[s.label] ?? 0) + w
            leftTotal += w
          } else {
            rightCounts[s.label] = (rightCounts[s.label] ?? 0) + w
            rightTotal += w
          }
        }

        if (leftTotal < this.config.minSamplesLeaf || rightTotal < this.config.minSamplesLeaf) {
          continue
        }

        const weightedGini =
          (leftTotal / total) * giniImpurity(leftCounts, leftTotal) +
          (rightTotal / total) * giniImpurity(rightCounts, rightTotal)

        if (weightedGini < bestGini) {
          bestGini = weightedGini
          bestThreshold = threshold
        }
      }
    }

    if (bestGini >= parentGini) return null

    const { left, right } = this.partition(samples, feature, bestThreshold)

    return {
      feature,
      threshold: bestThreshold,
      gini: bestGini,
      leftCount: left.length,
      rightCount: right.length,
    }
  }

  private partition(samples: TrainingSample[], feature: string, threshold: number | null) {
    const left: TrainingSample[] = []
    const right: TrainingSample[] = []

    for (const s of samples) {
      const val = encodeFeatureValue(s.features[feature])
      if (threshold === null) {
        // Boolean split: 0 = left, 1 = right
        if (val === 0) left.push(s)
        else right.push(s)
      } else {
        if (val <= threshold) left.push(s)
        else right.push(s)
      }
    }

    return { left, right }
  }

  private createLeaf(counts: Record<string, number>, total: number): TreeNode {
    let bestLabel = ''
    let bestCount = 0
    for (const label in counts) {
      if (counts[label] > bestCount) {
        bestLabel = label
        bestCount = counts[label]
      }
    }

    return {
      type: 'leaf',
      classCounts: counts,
      totalSamples: total,
      prediction: bestLabel,
      confidence: total > 0 ? bestCount / total : 0,
    }
  }

  // -------------------------------------------------------------------------
  // Prediction
  // -------------------------------------------------------------------------

  predict(features: FeatureVector): PredictionResult {
    if (!this.root) throw new Error('Tree not trained')

    const path: DecisionPath = []
    let node = this.root

    while (node.type === 'split') {
      const val = encodeFeatureValue(features[node.feature])

      if (node.threshold === null) {
        // Boolean split
        const goRight = val === 1
        path.push({
          feature: node.feature,
          threshold: null,
          direction: goRight ? 'right' : 'left',
          description: `${node.feature} is ${goRight ? 'true' : 'false'}`,
        })
        node = goRight ? node.right : node.left
      } else {
        // Numeric split
        const goRight = val > node.threshold
        path.push({
          feature: node.feature,
          threshold: node.threshold,
          direction: goRight ? 'right' : 'left',
          description: `${node.feature} ${goRight ? '>' : '<='} ${node.threshold}`,
        })
        node = goRight ? node.right : node.left
      }
    }

    // Compute probabilities from leaf counts
    const classProbabilities: Record<string, number> = {}
    for (const cls of this.classes) {
      classProbabilities[cls] = (node.classCounts[cls] ?? 0) / node.totalSamples
    }

    return {
      prediction: node.prediction,
      confidence: node.confidence,
      classProbabilities,
      decisionPath: path,
    }
  }

  /**
   * Score all classes for a feature vector, returning sorted results.
   */
  scoreAll(features: FeatureVector): Array<{ label: string; probability: number }> {
    const result = this.predict(features)
    return Object.entries(result.classProbabilities)
      .map(([label, probability]) => ({ label, probability }))
      .sort((a, b) => b.probability - a.probability)
  }

  // -------------------------------------------------------------------------
  // Introspection
  // -------------------------------------------------------------------------

  getFeatureImportances(): Record<string, number> {
    return { ...this.featureImportances }
  }

  getTopFeatures(n = 10): Array<{ feature: string; importance: number }> {
    return Object.entries(this.featureImportances)
      .map(([feature, importance]) => ({ feature, importance }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, n)
  }

  getClasses(): string[] {
    return [...this.classes]
  }

  getTreeDepth(): number {
    if (!this.root) return 0
    function depth(node: TreeNode): number {
      if (node.type === 'leaf') return 0
      return 1 + Math.max(depth(node.left), depth(node.right))
    }
    return depth(this.root)
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify({
      version: 1,
      config: this.config,
      featureNames: this.featureNames,
      featureImportances: this.featureImportances,
      classes: this.classes,
      root: this.root,
    })
  }

  static deserialize(json: string): DecisionTreeClassifier {
    const data = JSON.parse(json) as {
      version: number
      config: Required<TreeConfig>
      featureNames: string[]
      featureImportances: Record<string, number>
      classes: string[]
      root: TreeNode
    }

    const tree = new DecisionTreeClassifier(data.config)
    tree.featureNames = data.featureNames
    tree.featureImportances = data.featureImportances
    tree.classes = data.classes
    tree.root = data.root
    return tree
  }
}

// ---------------------------------------------------------------------------
// Random Forest (ensemble of decision trees)
// ---------------------------------------------------------------------------

export class RandomForestClassifier {
  private trees: DecisionTreeClassifier[] = []
  private classes: string[] = []
  private config: { nTrees: number; treeConfig: TreeConfig; subsampleRatio: number }

  constructor(config: {
    nTrees?: number
    treeConfig?: TreeConfig
    subsampleRatio?: number
  } = {}) {
    this.config = {
      nTrees: config.nTrees ?? 10,
      treeConfig: config.treeConfig ?? {},
      subsampleRatio: config.subsampleRatio ?? 0.8,
    }
  }

  train(samples: TrainingSample[]): void {
    const classSet = new Set<string>()
    for (const s of samples) classSet.add(s.label)
    this.classes = [...classSet].sort()

    this.trees = []

    for (let i = 0; i < this.config.nTrees; i++) {
      // Bootstrap sample
      const subsample = this.bootstrap(samples)
      const tree = new DecisionTreeClassifier({
        ...this.config.treeConfig,
        maxFeatures: this.config.treeConfig.maxFeatures ?? 'sqrt',
      })
      tree.train(subsample)
      this.trees.push(tree)
    }
  }

  private bootstrap(samples: TrainingSample[]): TrainingSample[] {
    const n = Math.floor(samples.length * this.config.subsampleRatio)
    const result: TrainingSample[] = []
    for (let i = 0; i < n; i++) {
      result.push(samples[Math.floor(Math.random() * samples.length)])
    }
    return result
  }

  predict(features: FeatureVector): PredictionResult {
    if (this.trees.length === 0) throw new Error('Forest not trained')

    // Aggregate predictions from all trees
    const totalProbs: Record<string, number> = {}
    for (const cls of this.classes) totalProbs[cls] = 0

    const allPaths: DecisionPath[] = []

    for (const tree of this.trees) {
      const result = tree.predict(features)
      for (const cls of this.classes) {
        totalProbs[cls] += result.classProbabilities[cls] ?? 0
      }
      allPaths.push(result.decisionPath)
    }

    // Average probabilities
    for (const cls of this.classes) {
      totalProbs[cls] /= this.trees.length
    }

    let bestLabel = ''
    let bestProb = 0
    for (const cls of this.classes) {
      if (totalProbs[cls] > bestProb) {
        bestLabel = cls
        bestProb = totalProbs[cls]
      }
    }

    // Use the path from the most confident tree for explanation
    return {
      prediction: bestLabel,
      confidence: bestProb,
      classProbabilities: totalProbs,
      decisionPath: allPaths[0], // representative path
    }
  }

  scoreAll(features: FeatureVector): Array<{ label: string; probability: number }> {
    const result = this.predict(features)
    return Object.entries(result.classProbabilities)
      .map(([label, probability]) => ({ label, probability }))
      .sort((a, b) => b.probability - a.probability)
  }

  getFeatureImportances(): Record<string, number> {
    if (this.trees.length === 0) return {}

    const combined: Record<string, number> = {}
    for (const tree of this.trees) {
      const importances = tree.getFeatureImportances()
      for (const [feature, importance] of Object.entries(importances)) {
        combined[feature] = (combined[feature] ?? 0) + importance
      }
    }

    for (const f in combined) {
      combined[f] /= this.trees.length
    }

    return combined
  }

  serialize(): string {
    return JSON.stringify({
      version: 1,
      config: this.config,
      classes: this.classes,
      trees: this.trees.map((t) => JSON.parse(t.serialize())),
    })
  }

  static deserialize(json: string): RandomForestClassifier {
    const data = JSON.parse(json) as {
      config: { nTrees: number; treeConfig: TreeConfig; subsampleRatio: number }
      classes: string[]
      trees: Array<unknown>
    }

    const forest = new RandomForestClassifier(data.config)
    forest.classes = data.classes
    forest.trees = data.trees.map((t) => DecisionTreeClassifier.deserialize(JSON.stringify(t)))
    return forest
  }
}
