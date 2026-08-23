import { toValidDate, getEffectiveActivityTimestamp } from './index';

// Umbral: Hace 30 días
const now = new Date('2026-08-23T12:00:00Z');
const threshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function shouldDelete(data: Record<string, any>): boolean {
  const effectiveDate = getEffectiveActivityTimestamp(data);
  if (!effectiveDate) return false; // NO DELETE si es inválido
  return effectiveDate < threshold; // DELETE solo si la fecha efectiva es anterior al umbral
}

let allPassed = true;

// Caso 1 — NO borrar
// createdAt = hace 60 días, updatedAt = hace 5 días, lastMessageTimestamp = hace 2 días
const c1 = {
  createdAt: daysAgo(60),
  updatedAt: daysAgo(5),
  lastMessageTimestamp: daysAgo(2)
};
const res1 = shouldDelete(c1);
console.log(`Caso 1: ${!res1 ? 'PASS (NO DELETE)' : 'FAIL (DELETED)'}`);
if (res1) allPassed = false;

// Caso 2 — NO borrar
// createdAt = hace 60 días, updatedAt = hace 40 días, lastMessageTimestamp = hace 10 días
const c2 = {
  createdAt: daysAgo(60),
  updatedAt: daysAgo(40),
  lastMessageTimestamp: daysAgo(10)
};
const res2 = shouldDelete(c2);
console.log(`Caso 2: ${!res2 ? 'PASS (NO DELETE)' : 'FAIL (DELETED)'}`);
if (res2) allPassed = false;

// Caso 3 — borrar
// createdAt = hace 60 días, updatedAt = hace 45 días, lastMessageTimestamp = hace 40 días
const c3 = {
  createdAt: daysAgo(60),
  updatedAt: daysAgo(45),
  lastMessageTimestamp: daysAgo(40)
};
const res3 = shouldDelete(c3);
console.log(`Caso 3: ${res3 ? 'PASS (DELETE)' : 'FAIL (NOT DELETED)'}`);
if (!res3) allPassed = false;

// Caso 4 — fallback
// createdAt = hace 40 días, updatedAt = inexistente, lastMessageTimestamp = inexistente
const c4 = {
  createdAt: daysAgo(40)
};
const res4 = shouldDelete(c4);
console.log(`Caso 4: ${res4 ? 'PASS (DELETE)' : 'FAIL (NOT DELETED)'}`);
if (!res4) allPassed = false;

// Caso 5 — inválido
// createdAt = "fecha-invalida", updatedAt = inexistente, lastMessageTimestamp = inexistente
const c5 = {
  createdAt: 'fecha-invalida'
};
const res5 = shouldDelete(c5);
console.log(`Caso 5: ${!res5 ? 'PASS (NO DELETE)' : 'FAIL (DELETED)'}`);
if (res5) allPassed = false;

if (allPassed) {
  console.log('\n✅ TODOS LOS TEST DE SEMÁNTICA PASARON CORRECTAMENTE.');
} else {
  console.error('\n❌ ALGUNOS TESTS DE SEMÁNTICA FALLARON.');
  process.exit(1);
}
