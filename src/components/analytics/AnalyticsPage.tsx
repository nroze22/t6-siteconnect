import {
  BarChart3,
  TrendingUp,
  PieChart,
  Users,
  Activity,
  Brain,
  Stethoscope,
  Pill,
  Heart,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
} from "recharts";

const diseasePrevalence = [
  { name: "Hypertension", count: 342, icd10: "I10" },
  { name: "Type 2 Diabetes", count: 278, icd10: "E11" },
  { name: "Hyperlipidemia", count: 245, icd10: "E78.5" },
  { name: "NSCLC", count: 89, icd10: "C34" },
  { name: "Heart Failure", count: 76, icd10: "I50" },
  { name: "COPD", count: 67, icd10: "J44" },
  { name: "Breast Cancer", count: 54, icd10: "C50" },
  { name: "Atrial Fib", count: 48, icd10: "I48" },
  { name: "CKD", count: 43, icd10: "N18" },
  { name: "Depression", count: 39, icd10: "F33" },
];

const ageDistribution = [
  { range: "18-30", count: 45 },
  { range: "31-40", count: 89 },
  { range: "41-50", count: 156 },
  { range: "51-60", count: 234 },
  { range: "61-70", count: 215 },
  { range: "71-80", count: 112 },
  { range: "80+", count: 49 },
];

const genderData = [
  { name: "Female", value: 486, color: "#ec4899" },
  { name: "Male", value: 401, color: "#3b82f6" },
  { name: "Other", value: 13, color: "#a78bfa" },
];

const insuranceMix = [
  { name: "Commercial", value: 412, color: "#3b82f6" },
  { name: "Medicare", value: 298, color: "#10b981" },
  { name: "Medicaid", value: 112, color: "#f59e0b" },
  { name: "Uninsured", value: 45, color: "#ef4444" },
  { name: "Other", value: 33, color: "#8b5cf6" },
];

const researchCapacity = [
  { area: "Oncology", eligible: 143, studies: 4, opportunity: "$892K" },
  { area: "Cardiology", eligible: 124, studies: 3, opportunity: "$558K" },
  { area: "Metabolic", eligible: 278, studies: 2, opportunity: "$421K" },
  { area: "Neurology", eligible: 39, studies: 1, opportunity: "$175K" },
  { area: "Immunology", eligible: 67, studies: 2, opportunity: "$312K" },
];

const tooltipStyle = {
  backgroundColor: "#1a1f2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  fontSize: 11,
  color: "#e2e8f0",
};

function StatCard({ icon, label, value, subtext, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-card p-4">
      <div className="flex items-center gap-2.5">
        <div className={`rounded-lg p-2 ${color}`}>{icon}</div>
        <div>
          <p className="text-[10px] font-medium text-slate-500">{label}</p>
          <p className="text-xl font-black text-white tabular-nums">{value}</p>
          {subtext && <p className="text-[10px] text-slate-500">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <h2 className="text-[15px] font-bold text-white">Population Analytics</h2>
        <p className="text-[12px] text-slate-500">
          AI-powered insights about your patient population — operational intelligence you can't get from your EMR.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Summary stats */}
        <div className="grid grid-cols-5 gap-3">
          <StatCard icon={<Users className="h-4 w-4 text-blue-400" />} label="Total Patients" value="900" color="bg-blue-500/10 ring-1 ring-blue-500/20" />
          <StatCard icon={<Stethoscope className="h-4 w-4 text-emerald-400" />} label="Unique Diagnoses" value="347" color="bg-emerald-500/10 ring-1 ring-emerald-500/20" />
          <StatCard icon={<Pill className="h-4 w-4 text-purple-400" />} label="Active Medications" value="1,284" color="bg-purple-500/10 ring-1 ring-purple-500/20" />
          <StatCard icon={<Activity className="h-4 w-4 text-amber-400" />} label="Lab Results" value="8,432" color="bg-amber-500/10 ring-1 ring-amber-500/20" />
          <StatCard icon={<Heart className="h-4 w-4 text-red-400" />} label="Trial-Eligible" value="651" subtext="72% of population" color="bg-red-500/10 ring-1 ring-red-500/20" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          {/* Disease Prevalence */}
          <div className="rounded-xl border border-white/[0.06] bg-card p-4">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              Disease Prevalence (Top 10)
            </h3>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={diseasePrevalence} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#94a3b8" }} width={75} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [String(value), "Patients"]} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Age Distribution */}
          <div className="rounded-xl border border-white/[0.06] bg-card p-4">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
              <TrendingUp className="h-4 w-4 text-indigo-400" />
              Age Distribution
            </h3>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [String(value), "Patients"]} />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gender */}
          <div className="rounded-xl border border-white/[0.06] bg-card p-4">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
              <PieChart className="h-4 w-4 text-indigo-400" />
              Gender Distribution
            </h3>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={genderData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                    {genderData.map((entry) => (<Cell key={entry.name} fill={entry.color} />))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Insurance Mix */}
          <div className="rounded-xl border border-white/[0.06] bg-card p-4">
            <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
              <PieChart className="h-4 w-4 text-indigo-400" />
              Insurance Mix
            </h3>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={insuranceMix} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                    {insuranceMix.map((entry) => (<Cell key={entry.name} fill={entry.color} />))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Research Capacity */}
        <div className="mt-6 rounded-xl border border-white/[0.06] bg-card p-4">
          <h3 className="flex items-center gap-2 text-[13px] font-bold text-slate-200">
            <Brain className="h-4 w-4 text-indigo-400" />
            Research Capacity Assessment
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Based on your patient population, your site has capacity across multiple therapeutic areas.
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-400">Therapeutic Area</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-400">Eligible Patients</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-400">Matching Studies</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-400">Revenue Opportunity</th>
                </tr>
              </thead>
              <tbody>
                {researchCapacity.map((row) => (
                  <tr key={row.area} className="border-t border-white/[0.04]">
                    <td className="px-4 py-2.5 font-medium text-slate-200">{row.area}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">{row.eligible}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{row.studies}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-400">{row.opportunity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Insights */}
        <div className="mt-6 rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-4">
          <h3 className="flex items-center gap-2 text-[13px] font-bold text-indigo-300">
            <Brain className="h-4 w-4 text-indigo-400" />
            AI-Generated Insights
          </h3>
          <div className="mt-3 space-y-2">
            {[
              "Your site has a strong oncology population with 89 patients with lung cancer diagnoses. 47 of these patients appear to be on first-line therapy, making them potential candidates for second-line checkpoint inhibitor studies.",
              "The high prevalence of Type 2 Diabetes (278 patients) and Obesity (189 patients with BMI > 30) creates a significant opportunity for GLP-1 receptor agonist trials.",
              "34% of your heart failure population (26 of 76 patients) have preserved ejection fraction (HFpEF), aligning well with several SGLT2 inhibitor studies currently in recruitment.",
              "Your patient demographics show strong diversity: 54% female, 18% Black/African American, 12% Hispanic — meeting FDA diversity requirements for multiple therapeutic areas.",
            ].map((insight, i) => (
              <div key={i} className="rounded-lg bg-card p-3 text-[12px] leading-relaxed text-slate-300 ring-1 ring-white/[0.06]">
                {insight}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
