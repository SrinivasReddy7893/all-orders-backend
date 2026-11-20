-- Orders already cancelled by an email get the date of that email.
UPDATE "Order" o
SET "cancelledAt" = e."occurredAt"
FROM (
  SELECT "orderId", MAX("occurredAt") AS "occurredAt"
  FROM "OrderEvent"
  WHERE "status" = 'CANCELLED'
  GROUP BY "orderId"
) e
WHERE e."orderId" = o."id" AND o."status" = 'CANCELLED' AND o."cancelledAt" IS NULL;
