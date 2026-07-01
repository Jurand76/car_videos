"use client";

import { useEffect, useRef } from "react";

import { initServiceApp } from "@/service/service-app";

type ServiceClientProps = {
  accessToken: string;
};

export function ServiceClient({ accessToken }: ServiceClientProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return initServiceApp(root, accessToken);
  }, [accessToken]);

  return (
    <div ref={rootRef} className="service-app-root">
      <main className="service-page">
        <section id="view-home" className="view">
          <div className="hero">
            <h1>Obsługa serwisowa</h1>
            <p className="lead">Wybierz moduł, aby zarządzać danymi warsztatu.</p>
          </div>

          <div className="tiles-grid">
            <button className="tile tile-customers" type="button" data-open="customers">
              <img
                className="tile-img"
                src="/service/tiles/customers.jpg"
                alt="Klienci"
              />
              <span className="badge badge-violet">Klienci</span>
              <h2 className="tile-title">Baza klientów</h2>
              <p className="tile-desc">
                Osoby prywatne i firmy — dane kontaktowe, NIP, historia pojazdów.
                <span className="tile-count" id="count-customers" />
              </p>
              <span className="tile-cta">Przeglądaj klientów →</span>
            </button>

            <button className="tile tile-cars" type="button" data-open="cars">
              <img className="tile-img" src="/service/tiles/cars.jpg" alt="Samochody" />
              <span className="badge badge-teal">Samochody</span>
              <h2 className="tile-title">Pojazdy</h2>
              <p className="tile-desc">
                Pojazdy klientów z danymi technicznymi i historią napraw.
                <span className="tile-count" id="count-cars" />
              </p>
              <span className="tile-cta">Przeglądaj samochody →</span>
            </button>

            <button className="tile tile-repairs" type="button" data-open="repairs">
              <img className="tile-img" src="/service/tiles/repairs.jpg" alt="Usługi" />
              <span className="badge badge-amber">Usługi</span>
              <h2 className="tile-title">Zlecenia serwisowe</h2>
              <p className="tile-desc">
                Naprawy i zlecenia z pozycjami, rozliczeniem VAT i podglądem do wydruku.
                <span className="tile-count" id="count-repairs" />
              </p>
              <span className="tile-cta">Przeglądaj usługi →</span>
            </button>
          </div>
        </section>

        <section id="view-customers" className="view" hidden>
          <header className="view-head">
            <div className="view-head-row">
              <h1 className="view-title">Klienci</h1>
              <button className="btn btn-primary" type="button" data-action="customer-new">
                + Nowy klient
              </button>
            </div>
          </header>
          <div className="toolbar">
            <input
              className="search-input"
              id="customer-search"
              type="search"
              placeholder="Szukaj: nazwa, telefon, NIP, email…"
            />
          </div>
          <div id="customer-list" className="list-grid" />
        </section>

        <section id="view-cars" className="view" hidden>
          <header className="view-head">
            <div className="view-head-row">
              <h1 className="view-title">Samochody</h1>
              <button className="btn btn-primary" type="button" data-action="car-new">
                + Nowy samochód
              </button>
            </div>
          </header>
          <div className="toolbar">
            <input
              className="search-input"
              id="car-search"
              type="search"
              placeholder="Szukaj: marka, model, rejestracja, VIN…"
            />
          </div>
          <div id="car-list" className="list-grid" />
        </section>

        <section id="view-repairs" className="view" hidden>
          <header className="view-head">
            <div className="view-head-row">
              <h1 className="view-title">Usługi</h1>
              <button className="btn btn-primary" type="button" data-action="repair-new">
                + Nowa naprawa
              </button>
            </div>
          </header>
          <div className="toolbar">
            <input
              className="search-input"
              id="repair-search"
              type="search"
              placeholder="Szukaj po statusie…"
            />
          </div>
          <div id="repair-list" className="list-grid" />
        </section>

        <div id="modal-root" className="modal-root" hidden>
          <div className="modal-backdrop" data-modal-close />
          <div className="modal" role="dialog" aria-modal="true">
            <header className="modal-head">
              <h2 id="modal-title" className="modal-title">
                Formularz
              </h2>
              <button className="btn btn-ghost" type="button" data-modal-close>
                ✕
              </button>
            </header>
            <div id="modal-body" className="modal-body" />
          </div>
        </div>

        <div id="toast" className="toast" hidden />
      </main>

      <div id="print-root" className="print-root" hidden />
    </div>
  );
}
