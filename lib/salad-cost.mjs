// GPU compute estimates from the live class rate, never from an assumed list price.
export function computeCost({hourlyUsd, elapsedMs, passed}) {
  if (!Number.isFinite(hourlyUsd) || hourlyUsd <= 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isInteger(passed) || passed < 0) throw new Error('Invalid cost inputs');
  const computeUsd = hourlyUsd * elapsedMs / 3_600_000;
  return {hourlyUsd, elapsedMs, passed, computeUsd, usdPerSuccessfulAnswer:passed ? computeUsd / passed : null, usdPerThousandSuccessfulAnswers:passed ? computeUsd * 1000 / passed : null};
}
