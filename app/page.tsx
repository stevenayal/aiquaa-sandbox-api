import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>aiquaa Sandbox API</h1>
        <p>
          API sandbox de práctica para el curso de Automatización de Pruebas de Software. Se
          conecta a un schema aislado (<code>qa_training</code>) en Postgres, separado de
          cualquier dato de producción.
        </p>
        <ul>
          <li>
            <code>POST /api/v1/sql/select</code> — ejecuta un statement SELECT
          </li>
          <li>
            <code>POST /api/v1/sql/update</code> — ejecuta un statement UPDATE (requiere WHERE)
          </li>
        </ul>
        <p>
          Documentación interactiva: <a href="/docs">/docs</a>
        </p>
      </main>
    </div>
  );
}
