import type { Metadata } from "next";
import Link from "next/link";

import { BatchConfirmationForm } from "@/app/kitchen/batch-confirmation-form";
import {
  AddManualGroceryItemForm,
  DerivedGroceryStateForm,
  DismissPreparationTaskForm,
  ManualGroceryItemForms
} from "@/app/kitchen/derived-work-forms";
import { BatchLifecycleForm } from "@/components/storage/batch-lifecycle-form";
import { DiscardBatchForm } from "@/components/storage/discard-batch-form";
import { getDerivedWork } from "@/modules/derived/queries";
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
    transitioned?: string;
    grocery?: string;
    work?: string;
  }>;
};

const statusLabels = {
  ready: "Ready",
  use_today: "Use Today",
  expired: "Expired",
  frozen: "Frozen",
  quality_due: "Quality date reached",
  thawing: "Thawing",
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
        {item.lifecycleState === "frozen" ? (
          <div>
            <dt>Quality-by date</dt>
            <dd>
              {item.qualityByAt
                ? formatStorageLocalDateTime(item.qualityByAt, timeZone)
                : "No quality date specified by the reviewed rule"}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="safety-note">
        {item.reviewedDurationRangeHours ? (
          <strong>
            Reviewed range{" "}
            {formatRange(
              item.reviewedDurationRangeHours.minimum,
              item.reviewedDurationRangeHours.maximum
            )}
            {item.appliedDurationHours === null
              ? null
              : `; ${item.appliedDurationHours} hours applied.`}
          </strong>
        ) : (
          <strong>
            No duration is applied to this informational quality guidance; the
            original discard deadline remains in force.
          </strong>
        )}
        <span>{item.guidance}</span>
        {item.transitionMethod ? (
          <span>
            <strong>Reviewed method:</strong> {item.transitionMethod}
          </span>
        ) : null}
        {item.refreezingPolicy ? (
          <span>
            <strong>Refreezing:</strong> {item.refreezingPolicy}
          </span>
        ) : null}
      </p>
      {item.actionGuidance ? (
        <aside className="safety-note" data-testid="reviewed-next-action">
          <strong>Reviewed guidance for the next action</strong>
          {item.actionMethod ? <span>{item.actionMethod}</span> : null}
          <span>{item.actionGuidance}</span>
          {item.actionRefreezingPolicy ? (
            <span>Refreezing: {item.actionRefreezingPolicy}</span>
          ) : null}
          {item.actionReturnPolicy ? (
            <span>Return policy: {item.actionReturnPolicy}</span>
          ) : null}
          {item.actionSourceTitle && item.actionSourceUrl ? (
            <a href={item.actionSourceUrl} rel="noreferrer" target="_blank">
              {item.actionSourceTitle}
            </a>
          ) : null}
        </aside>
      ) : null}
      <p className="batch-source">
        Reviewed {item.reviewedAt} ·{" "}
        <a href={item.sourceUrl} rel="noreferrer" target="_blank">
          {item.sourceTitle}
        </a>
      </p>
      <div className="batch-actions">
        {item.availableActions
          .filter((action) => action !== "discard")
          .map((action) => (
            <BatchLifecycleForm
              batchId={item.batchId}
              correctsEventId={
                action === "correct"
                  ? (item.correctionEventId ?? undefined)
                  : undefined
              }
              key={action}
              servedEventId={
                action === "return_untouched"
                  ? (item.returnServedEventId ?? undefined)
                  : undefined
              }
              targetRemaining={
                action === "correct"
                  ? Math.max(0, item.remainingPortions - 1)
                  : undefined
              }
              transition={action}
            />
          ))}
      </div>
      {item.availableActions.includes("discard") ? (
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
  const derivedWorkPromise = getDerivedWork();
  const previewPromise = params.componentId
    ? getRefrigeratedBatchPreview(params.componentId, params.preparedAt)
    : Promise.resolve(null);
  const [inventory, preview, derivedWork] = await Promise.all([
    inventoryPromise,
    previewPromise,
    derivedWorkPromise
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
  const frozenItems =
    inventory.status === "ready"
      ? inventory.items.filter(
          (item) =>
            item.storageStatus === "frozen" ||
            item.storageStatus === "quality_due"
        )
      : [];
  const thawingItems =
    inventory.status === "ready"
      ? inventory.items.filter((item) => item.storageStatus === "thawing")
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

      {params.transitioned ? (
        <p className="form-message form-message--success" role="status">
          Batch inventory updated.
        </p>
      ) : null}

      {params.work === "dismissed" ? (
        <p className="form-message form-message--success" role="status">
          This reminder is hidden. Its planned meals are unchanged.
        </p>
      ) : null}

      {params.grocery ? (
        <p className="form-message form-message--success" role="status">
          Grocery list updated.
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

      <section aria-labelledby="preparation-work-title">
        <p className="foundation-card__status">From the committed week</p>
        <h2 id="preparation-work-title">Preparation work</h2>
        <p>
          Tasks are consolidated by preparation. Quantities are practical
          portions, and each task links back to the meals it supports.
        </p>
        {derivedWork === null ? (
          <article className="foundation-card" role="alert">
            <h3>Preparation work unavailable</h3>
            <p>
              No task is inferred while the current plan and inventory cannot be
              verified.
            </p>
          </article>
        ) : derivedWork.preparationTasks.length === 0 ? (
          <article className="foundation-card">
            <h3>No preparation reminders</h3>
            <p>The current week has no uncovered preparation work.</p>
          </article>
        ) : (
          <div className="inventory-groups" data-testid="preparation-work">
            {derivedWork.preparationTasks.map((task) => (
              <article className="foundation-card" key={task.preparationId}>
                <p className="foundation-card__status">Plan-derived task</p>
                <h3>{task.preparationName}</h3>
                <p>
                  {task.neededPortions}{" "}
                  {task.neededPortions === 1 ? "portion" : "portions"} needed
                </p>
                <ul>
                  {task.supportingMeals.map((meal) => (
                    <li key={meal.componentId}>
                      {meal.localDate} · {meal.mealSlot}
                    </li>
                  ))}
                </ul>
                <div className="batch-actions">
                  <Link href={`/kitchen?componentId=${task.seedComponentId}`}>
                    Start this batch
                  </Link>
                  <DismissPreparationTaskForm
                    idempotencyKey={crypto.randomUUID()}
                    planVersion={derivedWork.planVersion}
                    preparationId={task.preparationId}
                    taskFingerprint={task.taskFingerprint}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="grocery-title">
        <p className="foundation-card__status">Synchronized list</p>
        <h2 id="grocery-title">Groceries</h2>
        <p>
          Plan-derived needs stay separate from manual items. Prepared
          inventory, configured quick backups, and already-have choices are
          accounted for without changing the Week plan.
        </p>
        {derivedWork === null ? (
          <article className="foundation-card" role="alert">
            <h3>Grocery needs unavailable</h3>
            <p>
              No grocery need is guessed while derived state is unavailable.
            </p>
          </article>
        ) : (
          <>
            <div data-testid="derived-groceries">
              {derivedWork.derivedGroceryItems
                .filter((item) => !item.alreadyHave)
                .map((item) => (
                  <article className="foundation-card" key={item.foodId}>
                    <p className="foundation-card__status">
                      Plan-derived · {item.storeSection}
                    </p>
                    <h3>{item.foodName}</h3>
                    <p>
                      {item.neededPortions}{" "}
                      {item.neededPortions === 1 ? "portion" : "portions"}
                    </p>
                    <div className="batch-actions">
                      <DerivedGroceryStateForm
                        alreadyHave={item.alreadyHave}
                        checked={item.checked}
                        foodId={item.foodId}
                        idempotencyKey={crypto.randomUUID()}
                        mode="checked"
                      />
                      <DerivedGroceryStateForm
                        alreadyHave={item.alreadyHave}
                        checked={item.checked}
                        foodId={item.foodId}
                        idempotencyKey={crypto.randomUUID()}
                        mode="alreadyHave"
                      />
                    </div>
                  </article>
                ))}
            </div>
            {derivedWork.derivedGroceryItems
              .filter((item) => item.alreadyHave)
              .map((item) => (
                <article className="foundation-card" key={item.foodId}>
                  <p className="foundation-card__status">
                    Already have · {item.storeSection}
                  </p>
                  <h3>{item.foodName}</h3>
                  <DerivedGroceryStateForm
                    alreadyHave={item.alreadyHave}
                    checked={item.checked}
                    foodId={item.foodId}
                    idempotencyKey={crypto.randomUUID()}
                    mode="alreadyHave"
                  />
                </article>
              ))}
            <div data-testid="manual-groceries">
              {derivedWork.manualGroceryItems.map((item) => (
                <article className="foundation-card" key={item.id}>
                  <p className="foundation-card__status">
                    Manual item · {item.storeSection}
                  </p>
                  <h3>{item.name}</h3>
                  <p>
                    {item.quantity} {item.quantity === 1 ? "item" : "items"}
                  </p>
                  <ManualGroceryItemForms
                    checkIdempotencyKey={crypto.randomUUID()}
                    deleteIdempotencyKey={crypto.randomUUID()}
                    editIdempotencyKey={crypto.randomUUID()}
                    item={item}
                  />
                </article>
              ))}
            </div>
            <AddManualGroceryItemForm idempotencyKey={crypto.randomUUID()} />
          </>
        )}
      </section>

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

            {frozenItems.length > 0 ? (
              <section aria-labelledby="frozen-inventory-title">
                <h3 id="frozen-inventory-title">Freezer</h3>
                <p>
                  Quality-by dates describe reviewed quality guidance, not an
                  automatic discard deadline.
                </p>
                <div className="batch-list">
                  {frozenItems.map((item) => (
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

            {thawingItems.length > 0 ? (
              <section aria-labelledby="thawing-inventory-title">
                <h3 id="thawing-inventory-title">Thawing</h3>
                <p>Follow the reviewed method before marking food thawed.</p>
                <div className="batch-list">
                  {thawingItems.map((item) => (
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
