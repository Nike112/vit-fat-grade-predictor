import { Card, PageHead } from "../components/ui";
import { fmt } from "../lib/format";
import { useApp } from "../state/AppState";

export default function Method() {
  const { analysis, rules } = useApp();
  const sigma = analysis ? fmt(analysis.fit.sigma, 1) : "σ̂";
  const tau = analysis ? fmt(analysis.tau, 1) : "τ";

  return (
    <>
      <PageHead title="Method" description="How GradeCast turns CAT and DA marks into a FAT prediction and a grade probability, and which probability and statistics ideas each step uses." />
      <Card className="prose-card">
        <div className="prose">
          <h2 style={{ marginTop: 0 }}>Problem</h2>
          <p>
            At VIT, a theory course's final grade depends on the FAT (40% of the total) and on <em>relative grading</em>: grade cutoffs are set from the class's own mean and standard deviation. When CAT and DA marks are out, a student knows 60% of their
            total but not their FAT score, and not where the cutoffs will land. GradeCast estimates both and reports the uncertainty as probabilities.
          </p>

          <h2>1 · Marks model</h2>
          <div className="formula">{`Internal = 0.3·CAT1 + 0.3·CAT2 + (DA1 + DA2 + DA3)      (out of 60)
Total    = Internal + 0.4·FAT                          (out of 100)`}</div>

          <h2>2 · Predict FAT with linear regression</h2>
          <p>Using past students who have already written the FAT, fit by ordinary least squares:</p>
          <div className="formula">{`FAT = β₀ + β₁·CAT1 + β₂·CAT2 + β₃·DA + ε,     ε ~ N(0, σ²)

β̂ = (XᵀX)⁻¹ Xᵀy          s² = Σ(yᵢ − ŷᵢ)² / (n − p)`}</div>
          <p>
            Every coefficient comes with a standard error, a t-test and a 95% confidence interval. R², adjusted R², an F-test and AIC compare the candidate models, and leave-one-section-out cross-validation checks them on sections the model never saw. On the
            current data the residual SE is about {sigma} marks.
          </p>

          <h2>3 · Prediction interval for one student</h2>
          <p>A new student's FAT is uncertain for two reasons: the regression line itself is estimated, and individuals scatter around it.</p>
          <div className="formula">{`SE_pred = s · √(1 + x₀ᵀ(XᵀX)⁻¹x₀)
95% PI  = ŷ₀ ± t₀.₉₇₅,ₙ₋ₚ · SE_pred`}</div>

          <h2>4 · Shared “paper difficulty” effect</h2>
          <p>
            Some FAT papers are harder than others, and that shock hits the whole section at once. Its size τ is estimated with a method-of-moments random-effects estimator from the section-mean residuals r̄ₛ:
          </p>
          <div className="formula">{`Var(r̄ₛ) ≈ τ² + σ²/nₛ    ⇒    τ̂² = max(0, Var(r̄ₛ) − mean(σ²/nₛ))`}</div>
          <p>
            Currently τ̂ ≈ {tau} marks. This matters because relative grading partly cancels it: if everyone does worse, the cutoffs drop too.
          </p>

          <h2>5 · Monte Carlo simulation of the class</h2>
          <p>Each of the 4,000 simulated runs does the following:</p>
          <ol>
            <li>Draw one shock δ ~ N(0, τ²) for the whole class.</li>
            <li>
              For every classmate (and you) draw FATᵢ = ŷᵢ + δ + σᵢ·T, where T follows Student's t with n − p degrees of freedom and σᵢ² = SE²_pred,ᵢ − τ². Round and clamp to 0–100.
            </li>
            <li>Compute totals, the class mean μ and SD σ, and the cutoffs μ + k·σ.</li>
            <li>Grade everyone: a total ≥ μ + 1.5σ earns S, ≥ μ + 0.5σ earns A, and so on. {rules.enforceFatMinimum ? `A FAT below ${rules.fatMinimum} earns F.` : ""}</li>
          </ol>
          <p>
            The share of runs ending in each grade estimates P(grade). By the law of large numbers, with 4,000 runs a probability p has a standard error of √(p(1−p)/4000) ≤ 0.8 percentage points. The spread of the simulated cutoffs gives the predicted grade
            ranges.
          </p>

          <h2>6 · Reading the results</h2>
          <ul>
            <li>
              <b>FAT needed for grade g</b> = (expected cutoff_g − Internal) / 0.4{rules.enforceFatMinimum ? `, and at least ${rules.fatMinimum}` : ""}.
            </li>
            <li>
              <b>Chance of g or better</b> = P(grade ≥ g), summed from the simulated grade distribution.
            </li>
            <li>
              <b>Grade strip</b>: your FAT is held at each value 0–100 and graded against every run's cutoffs. That gives P(grade | FAT = x).
            </li>
          </ul>

          <h2>7 · Validation</h2>
          <p>
            In the backtest on the Model page, each past section is hidden in turn. The model is refitted on the other sections, and the hidden section's grades are predicted from internal marks alone. The predictions are scored for exact accuracy,
            within-one-grade accuracy, and the average probability given to the true grade. The results are compared with the naive baseline of always guessing the most common grade.
          </p>

          <h2>Probability &amp; statistics concepts used</h2>
          <ul>
            <li>Random variables, expectation, variance; sample mean, SD, quantiles, skewness, kurtosis</li>
            <li>Normal distribution, z-scores and standardisation (relative grading itself is a z-score rule)</li>
            <li>Student's t distribution: confidence intervals, prediction intervals, coefficient t-tests</li>
            <li>F distribution (overall regression test) and χ² (Jarque–Bera normality test)</li>
            <li>Correlation (Pearson r) and simple and multiple linear regression</li>
            <li>Random effects and variance components (paper difficulty τ)</li>
            <li>Monte Carlo simulation and the law of large numbers</li>
            <li>Model selection and cross-validation (AIC, out-of-sample RMSE)</li>
          </ul>

          <h2>Assumptions &amp; limitations</h2>
          <ul>
            <li>The bundled data is simulated. Real predictions are only as good as the past-class data you upload.</li>
            <li>The model assumes this semester's FAT relates to internals the way past ones did. A new faculty member, syllabus or exam pattern breaks that.</li>
            <li>The grading rules are compiled from commonly reported VIT practice, not an official document. Edit them on the Grading rules page.</li>
            <li>Other rules are not modelled: attendance debarment, re-FAT, and moderation (e.g. awarding S to the top scorers when nobody crosses the S cutoff).</li>
            <li>The predictions are estimates for planning study effort, not official results.</li>
          </ul>
        </div>
      </Card>
    </>
  );
}
