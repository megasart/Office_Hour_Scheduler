(function (global) {
  const defaultTimeZone = "America/Los_Angeles";

  function isValidTimeZone(timeZone) {
    if (typeof timeZone !== "string" || timeZone.trim() === "") {
      return false;
    }

    try {
      new Intl.DateTimeFormat("en-US", {
        timeZone
      }).format();
      return true;
    } catch (error) {
      return false;
    }
  }

  function todayInTimeZone(timeZone = defaultTimeZone) {
    const resolvedTimeZone = isValidTimeZone(timeZone)
      ? timeZone
      : defaultTimeZone;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts
        .filter((part) => ["year", "month", "day"].includes(part.type))
        .map((part) => [part.type, part.value])
    );
    return values.year + "-" + values.month + "-" + values.day;
  }

  global.instOfficeTime = {
    defaultTimeZone,
    todayInTimeZone,
    isValidTimeZone
  };
})(window);
