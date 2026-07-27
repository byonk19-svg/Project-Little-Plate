type DestinationPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  nextStep: string;
};

export function DestinationPage({
  eyebrow,
  title,
  description,
  nextStep
}: DestinationPageProps) {
  return (
    <article className="destination-page">
      <div>
        <p className="destination-page__eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="destination-page__lede">{description}</p>
      </div>

      <section className="foundation-card" aria-labelledby="foundation-title">
        <p className="foundation-card__status">Foundation only</p>
        <h2 id="foundation-title">
          This destination is ready for its workflow.
        </h2>
        <p>{nextStep}</p>
      </section>

      <aside className="safety-note" aria-label="Safety content status">
        <strong>No feeding guidance is published yet.</strong>
        <span>
          Later tickets will show only reviewed, source-backed safety content.
        </span>
      </aside>
    </article>
  );
}
