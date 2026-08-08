// KYUM Phase 15.3.1 — Customer 360 Foundation Engine
(function () {
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
      || customer.contactDate
      || customer.lastContactDate
      || null;

    const inactivityDays = daysSince(lastContactDate);
    const hasOverdue = Boolean(followupStates.overdue);
    let status = {
      key: "active",
      label: "نشط",
      detail: "التواصل مع العميل ضمن النطاق الطبيعي."
    };

    if (hasOverdue) {
      status = {
        key: "overdue",
        label: "متابعة متأخرة",
        detail: "يوجد موعد متابعة تجاوز تاريخه."
      };
    } else if (!customerFollowups.length) {
      status = {
        key: "needs_followup",
        label: "يحتاج متابعة",
        detail: "لم تتم إضافة أي متابعة للعميل."
      };
    } else if (inactivityDays === null || inactivityDays > 30) {
      status = {
        key: "inactive",
        label: "غير نشط",
        detail: inactivityDays === null
          ? "لا يوجد تاريخ تواصل واضح."
          : `مر ${inactivityDays} يومًا منذ آخر تواصل.`
      };
    } else if (followupStates.today) {
      status = {
        key: "today",
        label: "متابعة اليوم",
        detail: "يوجد موعد متابعة مستحق اليوم."
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
        typeLabel: "بيانات العميل",
        title: "إنشاء ملف العميل",
        detail: customer.notes || "تم إنشاء ملف العميل في النظام.",
        date: customer.createdAt || customer.contactDate || null,
        meta: customer.representative || "—",
        status: "info"
      },
      ...customerFollowups.map(item => ({
        id: `followup-${item.id || Math.random()}`,
        type: "followup",
        typeLabel: "متابعة",
        title: item.result || "متابعة العميل",
        detail: item.notes || item.method || "تم تسجيل متابعة للعميل.",
        date: item.contactDate || item.createdAt || null,
        meta: [item.method, item.representative].filter(Boolean).join(" · ") || "—",
        status: followupState(item)
      })),
      ...customerQuotations.map(item => ({
        id: `quotation-${item.id || Math.random()}`,
        type: "quotation",
        typeLabel: "عرض سعر",
        title: item.code || item.quotationNumber || "عرض سعر",
        detail: [
          item.status || "غير محدد",
          amount(item.amount) ? `${amount(item.amount).toFixed(2)} SAR` : null,
          item.rejectionReason || item.noSaleReason || null
        ].filter(Boolean).join(" · "),
        date: item.quotationDate || item.createdAt || null,
        meta: item.representative || customer.representative || "—",
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
      riskReasons.push("لا توجد متابعة مسجلة للعميل.");
    }

    if (followupStates.overdue) {
      const overduePenalty = Math.min(30, (followupStates.overdue || 0) * 12);
      riskScore += overduePenalty;
      riskReasons.push(`يوجد ${followupStates.overdue} متابعة متأخرة.`);
    }

    if (inactivityDays === null) {
      riskScore += 15;
      riskReasons.push("لا يوجد تاريخ واضح لآخر تواصل.");
    } else if (inactivityDays > 60) {
      riskScore += 30;
      riskReasons.push(`مر ${inactivityDays} يومًا منذ آخر تواصل.`);
    } else if (inactivityDays > 30) {
      riskScore += 20;
      riskReasons.push(`العميل غير نشط منذ ${inactivityDays} يومًا.`);
    } else if (inactivityDays > 14) {
      riskScore += 10;
      riskReasons.push(`مر ${inactivityDays} يومًا منذ آخر تواصل.`);
    }

    if (rejected.length > accepted.length && rejected.length > 0) {
      riskScore += 15;
      riskReasons.push("العروض المرفوضة أكثر من العروض المقبولة.");
    }

    if (customerQuotations.length && !accepted.length) {
      riskScore += 10;
      riskReasons.push("لا توجد عروض أسعار مقبولة حتى الآن.");
    }

    if (!customer.representative && !customer.representativeId) {
      riskScore += 10;
      riskReasons.push("لا يوجد مندوب مسؤول محدد.");
    }

    if (!Array.isArray(customer.interests) || !customer.interests.length) {
      riskScore += 5;
      riskReasons.push("اهتمامات العميل غير مكتملة.");
    }

    riskScore = Math.min(100, Math.max(0, Math.round(riskScore)));
    const healthScore = 100 - riskScore;

    let priority = {
      key: "low",
      label: "أولوية منخفضة"
    };

    if (riskScore >= 70) {
      priority = { key: "critical", label: "أولوية حرجة" };
    } else if (riskScore >= 45) {
      priority = { key: "high", label: "أولوية مرتفعة" };
    } else if (riskScore >= 20) {
      priority = { key: "medium", label: "أولوية متوسطة" };
    }

    let nextAction = {
      title: "استمرار المتابعة الدورية",
      detail: "لا توجد مشكلة عاجلة، حافظ على التواصل المنتظم مع العميل."
    };

    if (followupStates.overdue) {
      nextAction = {
        title: "تنفيذ المتابعة المتأخرة فورًا",
        detail: "تواصل مع العميل وحدّث نتيجة المتابعة والموعد القادم."
      };
    } else if (!customerFollowups.length) {
      nextAction = {
        title: "إنشاء أول متابعة",
        detail: "حدد وسيلة التواصل وموعد المتابعة القادم."
      };
    } else if (inactivityDays === null || inactivityDays > 30) {
      nextAction = {
        title: "إعادة تنشيط العميل",
        detail: "ابدأ تواصلًا جديدًا وحدد احتياجه الحالي قبل إرسال عرض جديد."
      };
    } else if (open.length) {
      nextAction = {
        title: "متابعة عروض الأسعار المفتوحة",
        detail: `يوجد ${open.length} عرض مفتوح بقيمة ${openValue.toFixed(2)} SAR.`
      };
    } else if (!accepted.length && customerQuotations.length) {
      nextAction = {
        title: "مراجعة سبب عدم التحويل",
        detail: "راجع أسباب الرفض وعدّل العرض أو أسلوب المتابعة."
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
      ? { key: "strategic", label: "استراتيجي" }
      : totalQuotationValue >= 50000
        ? { key: "high", label: "قيمة مرتفعة" }
        : totalQuotationValue > 0
          ? { key: "standard", label: "قيمة متوسطة" }
          : { key: "new", label: "فرصة جديدة" };

    const risk = {
      score: riskScore,
      healthScore,
      priority,
      reasons: riskReasons.length
        ? riskReasons
        : ["لا توجد مؤشرات خطر واضحة حاليًا."],
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