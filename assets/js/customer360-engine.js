// KYUM Phase 15.3.1 — Customer 360 Foundation Engine
(function () {
  const t = (key, vars = {}) => window.PetatoeLocalization?.t?.(key, vars) || `[${key}]`;
  function followupResultLabel(value) {
    const map = {
      "تم التواصل": "followups.result.contacted", "لم يتم الرد": "followups.result.noAnswer",
      "طلب عقد": "followups.result.requestContract", "تم إرسال عقد": "followups.result.sentContract",
      "تفاوض": "followups.result.negotiation", "تم البيع": "followups.result.sold",
      "لم يتم البيع": "followups.result.notSold", "مؤجل": "followups.result.deferred"
    };
    return map[value] ? t(map[value]) : String(value || "");
  }
  function followupMethodLabel(value) {
    const map = {
      "اتصال": "followups.method.call", "واتساب": "followups.method.whatsapp", "زيارة": "followups.method.visit",
      "بريد إلكتروني": "followups.method.email", "اجتماع": "followups.method.meeting"
    };
    return map[value] ? t(map[value]) : String(value || "");
  }
  function quotationStatusLabel(value) {
    const map = {
      "قيد التنفيذ": "contracts.status.inProgress", "مقبول": "contracts.status.accepted",
      "مرفوض": "contracts.status.rejected", "ملغي": "customer360.contractStatus.cancelled"
    };
    return map[value] ? t(map[value]) : (value || t("customer360.common.unspecified"));
  }

  function asDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function amount(value) {
    return Number(value || 0);
  }

  function daysSince(value) {
    const date = asDate(value);
    if (!date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86400000));
  }

  function latestByDate(rows, fields) {
    return [...rows].sort((a, b) => {
      const dateA = fields.map(field => asDate(a?.[field])).find(Boolean);
      const dateB = fields.map(field => asDate(b?.[field])).find(Boolean);
      return Number(dateB || 0) - Number(dateA || 0);
    })[0] || null;
  }

  function followupState(item) {
    if (item?.completed) return "completed";
    const next = asDate(item?.nextFollowupDate);
    if (!next) return "no_date";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    next.setHours(0, 0, 0, 0);

    if (next < today) return "overdue";
    if (next.getTime() === today.getTime()) return "today";
    return "upcoming";
  }

  function build(customer, followups, quotations) {
    const customerFollowups = (followups || [])
      .filter(item => item.customerId === customer.id)
      .sort((a, b) => Number(asDate(b.contactDate || b.createdAt)) - Number(asDate(a.contactDate || a.createdAt)));

    const customerQuotations = (quotations || [])
      .filter(item => item.customerId === customer.id)
      .sort((a, b) => Number(asDate(b.quotationDate || b.createdAt)) - Number(asDate(a.quotationDate || a.createdAt)));

    const accepted = customerQuotations.filter(item => item.status === "مقبول");
    const open = customerQuotations.filter(item =>
      !["مقبول", "مرفوض", "ملغي"].includes(item.status)
    );

    const followupStates = customerFollowups.reduce((acc, item) => {
      const state = followupState(item);
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, {});

    const latestFollowup = latestByDate(customerFollowups, ["contactDate", "createdAt"]);
    const latestQuotation = latestByDate(customerQuotations, ["quotationDate", "createdAt"]);
    const lastContactDate = latestFollowup?.contactDate
      || customer.lastContactDate
      || null;

    const inactivityDays = daysSince(lastContactDate);
    const hasOverdue = Boolean(followupStates.overdue);
    let status = {
      key: "active",
      label: t("customer360.status.active"),
      detail: t("customer360.status.activeDetail")
    };

    if (hasOverdue) {
      status = {
        key: "overdue",
        label: t("customer360.status.overdue"),
        detail: t("customer360.status.overdueDetail")
      };
    } else if (!customerFollowups.length) {
      status = {
        key: "needs_followup",
        label: t("customer360.status.needsFollowup"),
        detail: t("customer360.status.needsFollowupDetail")
      };
    } else if (inactivityDays === null || inactivityDays > 30) {
      status = {
        key: "inactive",
        label: t("customer360.status.inactive"),
        detail: inactivityDays === null
          ? t("customer360.status.noContactDate")
          : t("customer360.status.daysSinceContact", { days: inactivityDays })
      };
    } else if (followupStates.today) {
      status = {
        key: "today",
        label: t("customer360.status.today"),
        detail: t("customer360.status.todayDetail")
      };
    }

    const totalQuotationValue = customerQuotations.reduce(
      (sum, item) => sum + amount(item.amount),
      0
    );
    const acceptedValue = accepted.reduce(
      (sum, item) => sum + amount(item.amount),
      0
    );


    const timeline = [
      {
        id: `customer-created-${customer.id}`,
        type: "customer",
        typeLabel: t("customer360.timeline.customerData"),
        title: t("customer360.timeline.customerCreated"),
        detail: t("customer360.timeline.customerCreatedDetail"),
        date: customer.createdAt || null,
        meta: "—",
        status: "info"
      },
      ...customerFollowups.map(item => ({
        id: `followup-${item.id || Math.random()}`,
        type: "followup",
        typeLabel: t("customer360.timeline.followup"),
        title: item.result ? followupResultLabel(item.result) : t("customer360.timeline.followupCustomer"),
        detail: item.notes || (item.method ? followupMethodLabel(item.method) : t("customer360.timeline.followupRecorded")),
        date: item.contactDate || item.createdAt || null,
        meta: [item.method ? followupMethodLabel(item.method) : "", item.representative].filter(Boolean).join(" · ") || "—",
        status: followupState(item)
      })),
      ...customerQuotations.map(item => ({
        id: `quotation-${item.id || Math.random()}`,
        type: "quotation",
        typeLabel: t("customer360.timeline.contract"),
        title: item.code || item.quotationNumber || t("customer360.timeline.contract"),
        detail: [
          quotationStatusLabel(item.status),
          amount(item.amount) ? `${amount(item.amount).toFixed(2)} SAR` : null,
          item.rejectionReason || item.noSaleReason || null
        ].filter(Boolean).join(" · "),
        date: item.quotationDate || item.createdAt || null,
        meta: item.representative || "—",
        status: item.status === "مقبول"
          ? "accepted"
          : item.status === "مرفوض" || item.status === "ملغي"
            ? "rejected"
            : "open"
      }))
    ]
      .filter(item => item.date)
      .sort((a, b) => Number(asDate(b.date)) - Number(asDate(a.date)));

    const rejected = customerQuotations.filter(item =>
      item.status === "مرفوض" || item.status === "ملغي"
    );
    const openValue = open.reduce((sum, item) => sum + amount(item.amount), 0);
    const rejectedValue = rejected.reduce((sum, item) => sum + amount(item.amount), 0);
    const responseRate = customerFollowups.length
      ? ((followupStates.completed || 0) / customerFollowups.length) * 100
      : 0;

    const riskReasons = [];
    let riskScore = 0;

    if (!customerFollowups.length) {
      riskScore += 25;
      riskReasons.push(t("customer360.risk.noFollowup"));
    }

    if (followupStates.overdue) {
      const overduePenalty = Math.min(30, (followupStates.overdue || 0) * 12);
      riskScore += overduePenalty;
      riskReasons.push(t("customer360.risk.overdueCount", { count: followupStates.overdue }));
    }

    if (inactivityDays === null) {
      riskScore += 15;
      riskReasons.push(t("customer360.risk.noLastContact"));
    } else if (inactivityDays > 60) {
      riskScore += 30;
      riskReasons.push(t("customer360.risk.daysSinceContact", { days: inactivityDays }));
    } else if (inactivityDays > 30) {
      riskScore += 20;
      riskReasons.push(t("customer360.risk.inactiveDays", { days: inactivityDays }));
    } else if (inactivityDays > 14) {
      riskScore += 10;
      riskReasons.push(t("customer360.risk.daysSinceContact", { days: inactivityDays }));
    }

    if (rejected.length > accepted.length && rejected.length > 0) {
      riskScore += 15;
      riskReasons.push(t("customer360.risk.moreRejected"));
    }

    if (customerQuotations.length && !accepted.length) {
      riskScore += 10;
      riskReasons.push(t("customer360.risk.noAccepted"));
    }



    riskScore = Math.min(100, Math.max(0, Math.round(riskScore)));
    const healthScore = 100 - riskScore;

    let priority = {
      key: "low",
      label: t("customer360.priority.low")
    };

    if (riskScore >= 70) {
      priority = { key: "critical", label: t("customer360.priority.critical") };
    } else if (riskScore >= 45) {
      priority = { key: "high", label: t("customer360.priority.high") };
    } else if (riskScore >= 20) {
      priority = { key: "medium", label: t("customer360.priority.medium") };
    }

    let nextAction = {
      title: t("customer360.next.periodic"),
      detail: t("customer360.next.periodicDetail")
    };

    if (followupStates.overdue) {
      nextAction = {
        title: t("customer360.next.overdue"),
        detail: t("customer360.next.overdueDetail")
      };
    } else if (!customerFollowups.length) {
      nextAction = {
        title: t("customer360.next.firstFollowup"),
        detail: t("customer360.next.firstFollowupDetail")
      };
    } else if (inactivityDays === null || inactivityDays > 30) {
      nextAction = {
        title: t("customer360.next.reactivate"),
        detail: t("customer360.next.reactivateDetail")
      };
    } else if (open.length) {
      nextAction = {
        title: t("customer360.next.openContracts"),
        detail: t("customer360.next.openContractsDetail", { count: open.length, value: openValue.toFixed(2) })
      };
    } else if (!accepted.length && customerQuotations.length) {
      nextAction = {
        title: t("customer360.next.reviewConversion"),
        detail: t("customer360.next.reviewConversionDetail")
      };
    }

    const engagementScore = Math.min(
      100,
      Math.round(
        Math.min(40, customerFollowups.length * 8)
        + Math.min(25, customerQuotations.length * 7)
        + Math.min(20, accepted.length * 10)
        + (inactivityDays !== null && inactivityDays <= 14 ? 15 : 0)
      )
    );

    const valueTier = acceptedValue >= 100000
      ? { key: "strategic", label: t("customer360.valueTier.strategic") }
      : totalQuotationValue >= 50000
        ? { key: "high", label: t("customer360.valueTier.high") }
        : totalQuotationValue > 0
          ? { key: "standard", label: t("customer360.valueTier.standard") }
          : { key: "new", label: t("customer360.valueTier.new") };

    const risk = {
      score: riskScore,
      healthScore,
      priority,
      reasons: riskReasons.length
        ? riskReasons
        : [t("customer360.risk.none")],
      nextAction,
      responseRate,
      engagementScore,
      openValue,
      rejectedValue,
      potentialValue: openValue + acceptedValue,
      valueTier
    };

    const latestActivity = timeline[0] || null;

    return {
      customer,
      followups: customerFollowups,
      quotations: customerQuotations,
      latestFollowup,
      latestQuotation,
      latestActivity,
      timeline,
      risk,
      lastContactDate,
      inactivityDays,
      status,
      followupStates,
      totals: {
        followups: customerFollowups.length,
        overdueFollowups: followupStates.overdue || 0,
        upcomingFollowups: (followupStates.today || 0) + (followupStates.upcoming || 0),
        completedFollowups: followupStates.completed || 0,
        quotations: customerQuotations.length,
        acceptedQuotations: accepted.length,
        openQuotations: open.length,
        totalQuotationValue,
        acceptedValue,
        conversionRate: customerQuotations.length
          ? (accepted.length / customerQuotations.length) * 100
          : 0
      }
    };
  }

  window.Customer360Engine = Object.freeze({ build });
})();