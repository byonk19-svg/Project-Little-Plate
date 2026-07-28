import type { Metadata } from "next";

import { BatchConfirmationForm } from "@/app/kitchen/batch-confirmation-form";
import { DiscardBatchForm } from "@/components/storage/discard-batch-form";
import {
  getKitchenInventory,
  getRefrigeratedBatchPreview,
  type KitchenInventoryItem
} from "@/modules/storage/queries";
import { formatStorageLocalDateTime } from "@/modules/storage/presentation";

export const metadata: Metadata = {
  title: "Kitchen"
};

type KitchenPageProps = {
  searchParams: Promise<{
    componentId?: string;
    created?: string;
    discarded?: string;
    preparedAt?: string;
  }>;
};

const statusLabels = {
  ready: "Ready",
  use_today: "Use Today",
  expired: "Expired",
  depleted: "Finished"
} as const;

function formatRange(minimum: number, maximum: number): string {
  return minimum === maximum
    ? `${minimum} hours`
    : `${minimum}–${maximum} hours`;
}

function BatchCard({
  item,
  timeZone,
  testId
}: {
  item: KitchenInventoryItem;
  timeZone: string;
  testId: "kitchen-batch" | "kitchen-expired-batch" | "kitchen-finished-batch";
}) {
  return (
    <article
      className="foundation-card batch-card"
      data-testid={testId}
      key={item.batchId}
    >
      <header>
        <p className={`batch-status batch-status--${item.storageStatus}`}>
          {statusLabels[item.storageStatus]}
        </p>
        <h3>{item.preparationName}</h3>
        <strong>
          {item.remainingPortions}{" "}
          {item.remainingPortions === 1 ? "portion" : "portions"} remaining
        </strong>
      </header>
      <dl className="batch-facts">
        <div>
          <dt>Prepared/opened</dt>
          <dd data-testid="kitchen-batch-prepared-time">
            {formatStorageLocalDateTime(item.preparedOrOpenedAt, timeZone)}
          </dd>
        </div>
        <div>
          <dt>Discard deadline</dt>
          <dd data-testid="kitchen-batch-deadline-time">
            {formatStorageLocalDateTime(item.deadlineAt, timeZone)}
          </dd>
        </div>
      </dl>
      <p className="safety-note">
        <strong>
          Reviewed range{" "}
          {formatRange(
            item.reviewedDurationRangeHours.minimum,
            item.reviewedDurationRangeHours.maximum
          )}
          ; {item.appliedDurationHours} hours applied.
        </strong>
        <span>{item.guidance}</span>
      </p>
      <p className="batch-source">
        Reviewed {item.reviewedAt} ·{" "}
        <a href={item.sourceUrl} rel="noreferrer" target="_blank">
          {item.sourceTitle}
        </a>
      </p>
      {item.remainingPortions > 0 ? (
        <DiscardBatchForm
          batchId={item.batchId}
          idempotencyKey={crypto.randomUUID()}
          returnTo="/kitchen"
        />
      ) : null}
    </article>
  );
}

export default async function KitchenPage({ searchParams }: KitchenPageProps) {
  const params = await searchParams;
  const inventoryPromise = getKitchenInventory();
  const previewPromise = params.componentId
    ? getRefrigeratedBatchPreview(params.componentId, params.preparedAt)
    : Promise.resolve(null);
  const [inventory, preview] = await Promise.all([
    inventoryPromise,
    previewPromise
  ]);
  const timeZone =
    inventory.status === "ready" ? inventory.timeZone : "America/Chicago";
  const activeItems =
    inventory.status === "ready"
      ? inventory.items.filter(
          (item) =>
            item.storageStatus === "ready" || item.storageStatus === "use_today"
        )
      : [];
  const expiredItems =
    inventory.status === "ready"
      ? inventory.items.filter((item) => item.storageStatus === "expired")
      : [];
  const finishedItems =
    inventory.status === "ready"
      ? inventory.items.filter((item) => item.storageStatus === "depleted")
      : [];

  return (
    <div className="kitchen-page">
      <header>
        <p className="destination-page__eyebrow">Prepare and store</p>
        <h1>Kitchen</h1>
        <p className="destination-page__lede">
          Prepare two portions and keep the reviewed refrigerator deadline
          attached to the batch.
        </p>
      </header>

      {params.created === "1" ? (
        <p className="form-message form-message--success" role="status">
          Two portions are in the refrigerator.
        </p>
      ) : null}

      {params.discarded === "1" ? (
        <p className="form-message form-message--success" role="status">
          Remaining portions were discarded.
        </p>
      ) : null}

      {params.componentId && preview?.status === "unsupported" ? (
        <section className="foundation-card">
          <p className="foundation-card__status">Guidance unavailable</p>
          <h2>This batch cannot be created safely</h2>
          <p>
            Active reviewed refrigerator guidance could not be verified for this
            preparation. No deadline or storage advice has been guessed.
          </p>
        </section>
      ) : null}

      {params.componentId &&
      preview?.status === "ready" &&
      inventory.status === "ready" ? (
        <section className="foundation-card batch-review">
          <p className="foundation-card__status">Review this batch</p>
          <h2>Review this batch</h2>
          <h3>{preview.preview.preparationName}</h3>
          <dl className="batch-facts">
            <div>
              <dt>Batch</dt>
              <dd>2 portions in the refrigerator</dd>
            </div>
            <div>
              <dt>Prepared/opened</dt>
              <dd data-testid="batch-preview-prepared-time">
                {formatStorageLocalDateTime(
                  preview.preview.preparedOrOpenedAt,
                  timeZone
                )}
              </dd>
            </div>
            <div>
              <dt>Reviewed range</dt>
              <dd>
                Reviewed range:{" "}
                {formatRange(
                  preview.preview.reviewedDurationRangeHours.minimum,
                  preview.preview.reviewedDurationRangeHours.maximum
                )}
              </dd>
            </div>
            <div>
              <dt>Applied deadline</dt>
              <dd data-testid="batch-preview-deadline-time">
                {formatStorageLocalDateTime(
                  preview.preview.deadlineAt,
                  timeZone
                )}
              </dd>
            </div>
          </dl>
          <p className="safety-note">
            <strong>
              Conservative duration: {preview.preview.appliedDurationHours}{" "}
              hours
            </strong>
            <span>{preview.preview.guidance}</span>
          </p>
          <p className="batch-source">
            Reviewed {preview.preview.reviewedAt} ·{" "}
            <a
              href={preview.preview.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {preview.preview.sourceTitle}
            </a>
          </p>
          <BatchConfirmationForm
            idempotencyKey={crypto.randomUUID()}
            mealComponentId={params.componentId}
            preparedOrOpenedAt={preview.preview.preparedOrOpenedAt}
          />
        </section>
      ) : null}

      <section className="kitchen-inventory">
        <div>
          <p className="foundation-card__status">Refrigerator inventory</p>
          <h2>Prepared portions</h2>
          {inventory.status === "ready" ? (
            <p className="week-page__timezone">
              Dates use {inventory.timeZone}.
            </p>
          ) : null}
        </div>

        {inventory.status === "unavailable" ? (
          <article className="foundation-card">
            <h3>Inventory unavailable</h3>
            <p>
              The active baby profile or inventory could not be verified. No
              portion status is being inferred.
            </p>
          </article>
        ) : inventory.items.length === 0 ? (
          <article className="foundation-card">
            <h3>No prepared portions yet</h3>
            <p>
              Open a planned meal from Week to create a reviewed refrigerated
              batch.
            </p>
          </article>
        ) : (
          <div className="inventory-groups">
            {activeItems.length > 0 ? (
              <section aria-labelledby="active-inventory-title">
                <h3 id="active-inventory-title">Available refrigerator</h3>
                <p>Earliest exact deadline first.</p>
                <div className="batch-list">
                  {activeItems.map((item) => (
                    <BatchCard
                      item={item}
                      key={item.batchId}
                      testId="kitchen-batch"
                      timeZone={inventory.timeZone}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {expiredItems.length > 0 ? (
              <section
                aria-labelledby="expired-inventory-title"
                className="expired-inventory"
              >
                <h3 id="expired-inventory-title">Expired</h3>
                <p>
                  These exact discard deadlines have passed. They cannot be
                  served or selected for a meal.
                </p>
                <div className="batch-list">
                  {expiredItems.map((item) => (
                    <BatchCard
                      item={item}
                      key={item.batchId}
                      testId="kitchen-expired-batch"
                      timeZone={inventory.timeZone}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {finishedItems.length > 0 ? (
              <section aria-labelledby="finished-inventory-title">
                <h3 id="finished-inventory-title">Finished</h3>
                <p>No portions remain in these batches.</p>
                <div className="batch-list">
                  {finishedItems.map((item) => (
                    <BatchCard
                      item={item}
                      key={item.batchId}
                      testId="kitchen-finished-batch"
                      timeZone={inventory.timeZone}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
