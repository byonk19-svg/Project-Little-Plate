import type { Metadata } from "next";
import Link from "next/link";

import {
  archivePreparedNote,
  createPreparedNote
} from "@/modules/prepared-notes/actions";
import { getPreparedNotes } from "@/modules/prepared-notes/queries";
import { getRecipePlanningOptions } from "@/modules/meals/recipe-week";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Kitchen" };

export default async function KitchenPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const [notesResult, recipes] = await Promise.all([
    getPreparedNotes(),
    getRecipePlanningOptions()
  ]);

  return (
    <div className="kitchen-page">
      <header>
        <p className="destination-page__eyebrow">Preparation notes</p>
        <h1>Kitchen</h1>
        <p className="destination-page__lede">
          Keep a lightweight record of what you prepared. This is a personal
          log, not inventory or an expiration tracker.
        </p>
      </header>

      {params.saved === "1" ? (
        <p className="form-message form-message--success" role="status">
          Kitchen note saved.
        </p>
      ) : null}
      {params.error ? (
        <p className="form-message form-message--error" role="alert">
          That kitchen note could not be saved.
        </p>
      ) : null}

      {notesResult.status === "signed_out" ? (
        <section className="foundation-card">
          <h2>Sign in to see preparation notes</h2>
          <Link className="primary-action primary-action--link" href="/login">
            Sign in
          </Link>
        </section>
      ) : notesResult.status === "unavailable" ? (
        <section className="foundation-card">
          <h2>Kitchen is unavailable</h2>
          <p>Refresh and try again.</p>
        </section>
      ) : (
        <>
          <section className="foundation-card" aria-labelledby="add-note-title">
            <p className="foundation-card__status">Add a note</p>
            <h2 id="add-note-title">What did you prepare?</h2>
            {recipes.length === 0 ? (
              <p>
                <Link href="/recipes/new">Add a recipe</Link> before logging
                preparation.
              </p>
            ) : (
              <form action={createPreparedNote} className="prepared-note-form">
                <label className="field">
                  <span>Recipe</span>
                  <select name="recipeId" required>
                    <option value="">Choose a recipe</option>
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select defaultValue="prepared" name="status">
                    <option value="preparing">Preparing</option>
                    <option value="prepared">Prepared</option>
                    <option value="used">Used</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="field">
                  <span>Portions (optional)</span>
                  <input min="0" name="portionCount" type="number" />
                </label>
                <label className="field">
                  <span>Notes (optional)</span>
                  <textarea maxLength={4000} name="notes" rows={3} />
                </label>
                <button className="primary-action" type="submit">
                  Save note
                </button>
              </form>
            )}
          </section>

          <section aria-labelledby="note-history-title">
            <p className="foundation-card__status">Your log</p>
            <h2 id="note-history-title">Recent preparation notes</h2>
            {notesResult.notes.length === 0 ? (
              <p>No preparation notes yet.</p>
            ) : (
              <div className="prepared-note-list">
                {notesResult.notes.map((note) => (
                  <article className="foundation-card" key={note.id}>
                    <p className="foundation-card__status">{note.status}</p>
                    <h3>
                      <Link href={`/recipes/${note.recipe.id}`}>
                        {note.recipe.title}
                      </Link>
                    </h3>
                    {note.portionCount !== null ? (
                      <p>{note.portionCount} portions</p>
                    ) : null}
                    {note.notes ? (
                      <p className="recipe-text">{note.notes}</p>
                    ) : null}
                    {note.status !== "archived" ? (
                      <form action={archivePreparedNote.bind(null, note.id)}>
                        <button className="secondary-action" type="submit">
                          Archive note
                        </button>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
