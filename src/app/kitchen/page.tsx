import type { Metadata } from "next";

import { BatchConfirmationForm } from "@/app/kitchen/batch-confirmation-form";
import {
  getKitchenInventory,
  getRefrigeratedBatchPreview
} from "@/modules/storage/queries";

export const metadata: Metadata = {
  title: "Kitchen"
};

type KitchenPageProps = {
  searchParams: Promise<{
    componentId?: string;
    created?: string;
    preparedAt?: string;
  }>;
};

const statusLabels = {
  ready: "Ready",
  use_today: "Use Today",
  expired: "Expired"
} as const;

function formatLocalDateTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(instant));
}

function formatRange(minimum: number, maximum: number): string {
  return minimum === maximum
    ? `${minimum} hours`
    : `${minimum}–${maximum} hours`;
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
                {formatLocalDateTime(
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
                {formatLocalDateTime(preview.preview.deadlineAt, timeZone)}
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
          <div className="batch-list">
            {inventory.items.map((item) => (
              <article
                className="foundation-card batch-card"
                data-testid="kitchen-batch"
                key={item.batchId}
              >
                <header>
                  <p
                    className={`batch-status batch-status--${item.storageStatus}`}
                  >
                    {statusLabels[item.storageStatus]}
                  </p>
                  <h3>{item.preparationName}</h3>
                  <strong>{item.remainingPortions} portions remaining</strong>
                </header>
                <dl className="batch-facts">
                  <div>
                    <dt>Prepared/opened</dt>
                    <dd data-testid="kitchen-batch-prepared-time">
                      {formatLocalDateTime(
                        item.preparedOrOpenedAt,
                        inventory.timeZone
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Discard deadline</dt>
                    <dd data-testid="kitchen-batch-deadline-time">
                      {formatLocalDateTime(item.deadlineAt, inventory.timeZone)}
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
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
