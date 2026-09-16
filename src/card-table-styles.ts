import { css } from "lit";

export const cardTableStyles = css`
  .game-tabs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--color-border, #d0d8d0);
  }
  .game-tabs [role="tab"] {
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--color-muted, #506050);
    margin-bottom: -1px;
  }
  .game-tabs [role="tab"][aria-selected="true"] {
    border-bottom-color: currentColor;
    color: var(--color-text, #202820);
    font-weight: 600;
  }
  .subtabs {
    font-size: 0.875rem;
    margin-top: 1rem;
  }
  :host {
    display: block;
    min-width: 0;
    color: var(--color-text, #202820);
    font-family: inherit;
  }
  * {
    box-sizing: border-box;
  }
  .game {
    padding: clamp(1rem, 3vw, 2rem);
    border: 1px solid var(--color-border, #d0d8d0);
    border-radius: 1rem;
    background: var(--color-surface, #f7f9f5);
  }
  .toolbar,
  .controls,
  .hand-controls,
  .hand-heading,
  .reset {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .toolbar,
  .hand-heading {
    justify-content: space-between;
  }
  .mode,
  .status,
  details,
  .empty-hand {
    color: var(--color-muted, #506050);
  }
  .mode {
    margin: 0;
    font-size: 0.875rem;
  }
  button,
  select {
    font: inherit;
    color: inherit;
    border: 1px solid var(--color-border-strong, #859585);
    border-radius: 0.5rem;
    background: var(--color-background, #fff);
    padding: 0.5rem 0.75rem;
    min-height: 2.75rem;
  }
  button,
  summary,
  select {
    cursor: pointer;
  }
  button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  button:hover:not(:disabled),
  select:hover {
    border-color: var(--color-text, #202820);
  }
  button:focus-visible,
  select:focus-visible,
  summary:focus-visible {
    outline: 3px solid var(--color-primary, #386541);
    outline-offset: 4px;
  }
  .reset {
    margin-top: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--color-border, #d0d8d0);
    border-radius: 0.5rem;
  }
  .table {
    display: flex;
    justify-content: center;
    gap: clamp(2rem, 8vw, 6rem);
    margin-block: 1.5rem;
    padding: 1.5rem 1rem;
    border-radius: 0.75rem;
    background: var(--color-hover, #e9efe7);
  }
  .pile {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
  }
  .pile strong {
    margin-left: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  .card {
    width: 4.5rem;
    height: 6.5rem;
    padding: 0.375rem;
    border-radius: 0.5rem;
  }
  .face {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: #202820;
    background: #fffdf8;
    border: 1px solid #778273;
    font-weight: 700;
  }
  .face[data-suit="Hearts"],
  .face[data-suit="Diamonds"] {
    color: #af2537;
  }
  .rank {
    align-self: flex-start;
    line-height: 1;
    font-size: 1rem;
  }
  .face-labels {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 100%;
    height: 100%;
  }
  .card-art {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background-size: var(--card-art-size, 100% 100%);
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: var(--card-art-rendering, auto);
    pointer-events: none;
  }
  .suit {
    align-self: center;
    font-size: 1.75rem;
    line-height: 1;
  }
  .bottom {
    align-self: flex-end;
    transform: rotate(180deg);
  }
  .back {
    color: var(--card-back-ink, #fffdf8);
    background-image: var(
      --card-back-image,
      repeating-linear-gradient(45deg, #355342 0px, #355342 5px, #42634e 5px, #42634e 7px)
    );
    background-size: var(--card-back-size, 100% 100%);
    background-position: center;
    border: 3px double #d8e4d8;
    font-size: 1.75rem;
  }
  .back:disabled {
    font-size: 0.875rem;
  }
  .back-mark {
    visibility: var(--card-back-mark-visibility, visible);
  }
  :host([random-backs]) .back {
    background-image: var(--card-random-back-image, var(--card-back-image));
  }
  .empty {
    display: grid;
    place-content: center;
    text-align: center;
    border: 1px dashed var(--color-border-strong, #859585);
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  h3 span {
    font-weight: 400;
  }
  label {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.875rem;
  }
  .hand-region {
    margin: 1rem 0;
  }
  .hand-content {
    display: flow-root;
  }
  .hand-content > .empty-hand {
    margin: 0;
  }
  .hand {
    display: flex;
    flex-wrap: wrap;
    gap: 0.625rem;
    margin: 0;
    padding: 0;
    list-style: none;
    isolation: isolate;
  }
  .hand[data-layout="fan"] {
    display: block;
    position: relative;
    --hover-lift: 1rem;
  }
  .hand[data-layout="fan"] > li {
    position: absolute;
    left: var(--fan-x);
    top: var(--fan-y);
    z-index: var(--fan-order);
  }
  .hand > li:has([data-in-flight]) {
    z-index: 100;
  }
  .hand > li:has(button:hover),
  .hand > li:focus-within {
    z-index: 101;
  }
  .hand > li > .card {
    transition: transform 240ms ease;
    will-change: transform;
    position: relative;
    touch-action: none;
    user-select: none;
    cursor: grab;
    transform: rotate(var(--card-angle, 0deg));
  }
  .hand-help {
    font-size: 0.875rem;
    color: var(--color-muted, #506050);
    line-height: 1.5;
  }
  .hand[data-dragging] > li > .card {
    transform: rotate(var(--card-angle, 0deg));
    cursor: grabbing;
  }
  .hand > li > .card[data-drag-source] {
    opacity: 0.35;
  }
  .card[data-drop-side]::after {
    content: "";
    position: absolute;
    width: 3px;
    top: -0.25rem;
    bottom: -0.25rem;
    z-index: 101;
    background: var(--color-primary, #386541);
    border-radius: 2px;
  }
  .card[data-drop-side="before"]::after {
    left: -0.45rem;
  }
  .card[data-drop-side="after"]::after {
    right: -0.45rem;
  }
  .drag-preview,
  .card-flight[data-flight-ghost] {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 100;
    pointer-events: none;
    margin: 0;
    box-shadow: 0 0.5rem 1.5rem #0004;
    will-change: transform;
    cursor: grabbing;
  }
  .card-flight {
    z-index: 100;
    pointer-events: none;
  }
  .card-shell {
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    perspective: 600px;
  }
  .flight-flipper {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transform: rotateY(0deg);
    will-change: transform;
  }
  .flight-front,
  .flight-back {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    backface-visibility: hidden;
  }
  .drag-preview .flight-front {
    box-shadow: 0 0.5rem 1.5rem #0004;
  }
  .flight-back {
    display: grid;
    place-items: center;
    transform: rotateY(180deg);
  }
  .flight-flipper[data-flip-axis="X"] > .flight-back {
    transform: rotateX(180deg);
  }
  .hand > li > .card:hover,
  .hand > li > .card:focus-visible {
    transform: translateY(calc(-1 * var(--hover-lift, 0.25rem))) rotate(var(--card-angle, 0deg));
  }
  .hand[data-dragging] > li > .card:hover,
  .hand[data-dragging] > li > .card:focus-visible {
    transform: rotate(var(--card-angle, 0deg));
  }
  .hand > li > .card[data-in-flight] {
    transform: rotate(var(--card-angle, 0deg));
    transition: none;
  }
  .layout-switch {
    display: inline-flex;
    position: relative;
    gap: 0.125rem;
    padding: 0.125rem;
    border: 1px solid var(--color-border, #d0d8d0);
    border-radius: 0.625rem;
  }
  .layout-switch::before {
    content: "";
    position: absolute;
    inset-block: 0.125rem;
    left: 0.125rem;
    width: 2.5rem;
    border-radius: 0.5rem;
    background: var(--color-hover, #e9efe7);
    pointer-events: none;
    transform: translateX(0);
    transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .layout-switch:has(button:nth-child(2)[aria-pressed="true"])::before {
    transform: translateX(calc(100% + 0.125rem));
  }
  .flip-switch {
    display: inline-grid;
    grid-template-columns: repeat(2, 2.5rem);
  }
  .flip-switch::before {
    bottom: auto;
    height: 2.5rem;
  }
  .flip-switch:has(button:nth-child(3)[aria-pressed="true"])::before {
    transform: translateY(calc(100% + 0.125rem));
  }
  .flip-switch:has(button:nth-child(4)[aria-pressed="true"])::before {
    transform: translate(calc(100% + 0.125rem), calc(100% + 0.125rem));
  }
  .layout-switch button {
    display: grid;
    place-items: center;
    position: relative;
    width: 2.5rem;
    min-height: 2.5rem;
    padding: 0.375rem;
    border: 0;
    background: transparent;
    color: var(--color-muted, #506050);
  }
  .layout-switch button[aria-pressed="true"] {
    color: var(--color-text, #202820);
  }
  .layout-switch svg {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .layout-tooltip {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    padding: 0.375rem 0.625rem;
    border-radius: 0.375rem;
    color: var(--color-background, #fff);
    background: var(--color-text, #202820);
    font-size: 0.75rem;
    white-space: nowrap;
    visibility: hidden;
    pointer-events: none;
  }
  .layout-switch button:hover .layout-tooltip,
  .layout-switch button:focus-visible .layout-tooltip {
    visibility: visible;
  }
  .empty-hand {
    padding-block: 1rem;
  }
  .status {
    min-height: 1.5em;
    font-size: 0.875rem;
  }
  details {
    border-top: 1px solid var(--color-border, #d0d8d0);
    padding-top: 0.875rem;
    font-size: 0.875rem;
    line-height: 1.6;
  }
  details p {
    max-width: 70ch;
  }
  summary {
    width: fit-content;
  }
  @media (prefers-reduced-motion: reduce) {
    .layout-switch::before,
    .hand > li > .card {
      transition: none;
    }
  }
`;
