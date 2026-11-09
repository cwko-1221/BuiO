import './styles/main.css';
import './styles/expedition.css';
import './styles/journal.css';
import './styles/battle-polish.css';
import './styles/world-polish.css';
import { GameController } from './game/GameController.mjs';

const rootEl = document.getElementById('rpg-app');
const game = new GameController(rootEl);

if (typeof window !== 'undefined') {
  window.__POKEMON_RPG__ = game;
}

game.init().catch((err) => {
  console.error('[PokemonRPG] Boot error:', err);
});
