import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, PageShell, Select, Table, TableCell, TableHead, TableHeaderCell, TableRow } from "@nodex/ui";
import { formatNumber } from "@nodex/i18n";
import { ApiClient, FinanceSummary } from "../api/client";

const client = new ApiClient({
  onUnauthorized: () => {
    window.location.href = "/login";
  },
});

export function FinancePage() {
  const { t } = useTranslation();
  const [range, setRange] = useState("week");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.getFinance(range);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.finance.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [range]);

  const metrics = summary
    ? [
        { label: t("admin.finance.gmv"), value: formatNumber(summary.gmv), tone: "primary" as const },
        { label: t("admin.finance.grossRevenue"), value: formatNumber(summary.gross_revenue), tone: "default" as const },
        { label: t("admin.finance.serviceFees"), value: formatNumber(summary.service_fee_total), tone: "default" as const },
        { label: t("admin.finance.deliveryFees"), value: formatNumber(summary.delivery_fee_total), tone: "default" as const },
        { label: t("admin.finance.promoDiscounts"), value: formatNumber(summary.promo_discounts_total), tone: "warning" as const },
        { label: t("admin.finance.platformIncome"), value: formatNumber(summary.platform_income), tone: "success" as const },
        { label: t("admin.finance.vendorPayouts"), value: formatNumber(summary.vendor_payouts), tone: "default" as const },
        { label: t("admin.finance.completedOrders"), value: formatNumber(summary.completed_count), tone: "default" as const },
      ]
    : [];

  return (
    <PageShell
      title={t("admin.finance.title")}
      subtitle={t("admin.finance.subtitle")}
      actions={
        <div className="inline flex items-center gap-2">
          <Select value={range} onChange={(event) => setRange(event.target.value)}>
            <option value="week">{t("admin.finance.lastWeek")}</option>
            <option value="month">{t("admin.finance.lastMonth")}</option>
          </Select>
          <Button variant="secondary" onClick={() => void load()}>
            {t("common.refresh")}
          </Button>
        </div>
      }
    >
      {error && <div className="error-banner">{error}</div>}
      {isLoading ? (
        <p>{t("admin.finance.loading")}</p>
      ) : summary ? (
        <>
          <div className="metric-grid">
            {metrics.map((metric) => (
              <article key={metric.label} className={`metric-card ${metric.tone}`}>
                <p className="metric-label">{metric.label}</p>
                <p className="metric-value">{metric.value}</p>
              </article>
            ))}
          </div>

          <section className="section-card">
            <div className="section-card-header">
              <h2>{t("admin.finance.byVendor")}</h2>
            </div>
            {summary.by_vendor && summary.by_vendor.length > 0 ? (
              <div className="table-wrap">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{t("admin.finance.vendor")}</TableHeaderCell>
                      <TableHeaderCell>{t("admin.finance.gmv")}</TableHeaderCell>
                      <TableHeaderCell>{t("admin.finance.orders")}</TableHeaderCell>
                      <TableHeaderCell>{t("admin.finance.platformIncome")}</TableHeaderCell>
                      <TableHeaderCell>{t("admin.finance.vendorOwes")}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <tbody>
                    {summary.by_vendor.map((row) => (
                      <TableRow key={row.vendor_id}>
                        <TableCell>{row.vendor_name}</TableCell>
                        <TableCell>{formatNumber(row.gmv)}</TableCell>
                        <TableCell>{formatNumber(row.completed_count)}</TableCell>
                        <TableCell>{formatNumber(row.platform_income)}</TableCell>
                        <TableCell>{formatNumber(row.vendor_owes)}</TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : (
              <p>{t("admin.finance.empty")}</p>
            )}
          </section>
        </>
      ) : (
        <p>{t("admin.finance.empty")}</p>
      )}
    </PageShell>
  );
}
