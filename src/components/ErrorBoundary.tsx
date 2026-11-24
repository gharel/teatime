import { Component, type ErrorInfo, type ReactNode } from 'react';
import { journal } from '../lib/journal';

interface Props {
  children: ReactNode;
  /** Toute l'appli (plein écran) plutôt qu'une page. */
  full?: boolean;
}

function message(e: unknown): string {
  return String((e as Error | null)?.message ?? e).slice(0, 160);
}

/**
 * Filet de sécurité : sans lui, une erreur pendant l'affichage retire toute l'appli et laisse une page
 * vide (noire en thème sombre). On montre un message et « Recharger » à la place, et l'erreur est notée
 * au journal (Réglages → Diagnostic).
 */
export default class ErrorBoundary extends Component<Props, { failed: boolean; error: unknown }> {
  state = { failed: false, error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const where = info.componentStack?.trim().split('\n')[0]?.trim();
    journal(`⚠ erreur d’affichage : ${message(error)}${where ? ` (${where})` : ''}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={this.props.full ? 'crash-screen' : 'crash-page'} role="alert">
        <div className="card stack">
          <h2>Cette page n’a pas pu s’afficher</h2>
          <p className="muted">Rechargez : vos progrès restent enregistrés sur cet appareil.</p>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Recharger
          </button>
          <code className="crash-detail">{message(this.state.error)}</code>
        </div>
      </div>
    );
  }
}
