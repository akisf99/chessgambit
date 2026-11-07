(() => {
  const R = window.MysteryChessRules;
  const main = document.getElementById('main');
  const glyph = { K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙', k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'\u265f\ufe0e' };
  const pieceNames = { p:'Pawn', n:'Knight', b:'Bishop', r:'Rook', q:'Queen' };
  const pieceValues = { p:100, n:315, b:330, r:500, q:900, k:20000 };
  const slots = {
    w: {
      p:['a2','b2','c2','d2','e2','f2','g2','h2'],
      r:['a1','h1'], n:['b1','g1'], b:['c1','f1'], q:['d1']
    },
    b: {
      p:['a7','b7','c7','d7','e7','f7','g7','h7'],
      r:['a8','h8'], n:['b8','g8'], b:['c8','f8'], q:['d8']
    }
  };

  let mode = 'local';
  let humanColor = 'w';
  let playerNames = { w:'Player 1', b:'Player 2' };
  let phase = 'home';
  let allocBoard = emptyBoard();
  let pieceBag = [];
  let allocIndex = 0;
  let allocTurn = 'w';
  let allocLog = [];
  let latestReveal = null;
  let gameHistory = [];
  let moveRecords = [];
  let selectedSquare = null;
  let pendingPromotion = null;
  let cpuThinking = false;
  let cpuTimer = null;
  let toastTimer = null;
  let toastMessage = '';
  let lastMove = null;

  function emptyBoard() { return Array(128).fill('.'); }
  function shuffle(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function makeBag() {
    const bag = [];
    for (const color of ['w','b']) {
      for (let i=0;i<8;i++) bag.push({color,type:'p'});
      for (const type of ['r','n','b']) for (let i=0;i<2;i++) bag.push({color,type});
      bag.push({color,type:'q'});
    }
    return shuffle(bag);
  }
  function colorWord(c) { return c === 'w' ? 'White' : 'Black'; }
  function pieceChar(piece) { return piece.color === 'w' ? piece.type.toUpperCase() : piece.type; }
  function playerLabel(c) {
    if (mode === 'cpu') return c === humanColor ? `${playerNames[c]} · ${colorWord(c)}` : `Computer · ${colorWord(c)}`;
    return `${playerNames[c]} · ${colorWord(c)}`;
  }
  function isCpuAllocationTurn() { return mode === 'cpu' && allocTurn !== humanColor; }
  function isCpuGameTurn() { return mode === 'cpu' && currentGame()?.t !== (humanColor === 'w' ? 1 : -1); }
  function currentGame() { return gameHistory.length ? gameHistory[gameHistory.length - 1] : null; }
  function clearTimers() {
    if (cpuTimer) clearTimeout(cpuTimer);
    if (toastTimer) clearTimeout(toastTimer);
    cpuTimer = null; toastTimer = null; cpuThinking = false; toastMessage = ''; 
  }
  function sayToast(message) {
    toastMessage = message;
    renderToast();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastMessage = ''; renderToast(); }, 2300);
  }
  function renderToast() {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    if (!toastMessage) return;
    const el = document.createElement('div'); el.className='toast'; el.textContent=toastMessage;
    document.body.appendChild(el);
  }
  function startSetup() {
    clearTimers();
    phase = 'setup';
    render();
  }
  function beginAllocation() {
    clearTimers();
    allocBoard = emptyBoard();
    allocBoard[R.index('e1')] = 'K';
    allocBoard[R.index('e8')] = 'k';
    pieceBag = makeBag();
    allocIndex = 0;
    allocTurn = 'w';
    allocLog = [];
    latestReveal = null;
    gameHistory = [];
    moveRecords = [];
    selectedSquare = null;
    pendingPromotion = null;
    lastMove = null;
    phase = 'allocation';
    render();
    maybeCpuAllocation();
  }
  function availableSlots(color, type) {
    return slots[color][type].filter(s => allocBoard[R.index(s)] === '.');
  }
  function validAllocationTargets(piece) {
    return ['w','b'].filter(side => availableSlots(side, piece.type).length > 0);
  }
  function allocatePiece(targetSide, byCpu = false) {
    if (phase !== 'allocation' || (isCpuAllocationTurn() && !byCpu)) return;
    const piece = pieceBag[allocIndex];
    if (!piece || !validAllocationTargets(piece).includes(targetSide)) return;
    const choices = availableSlots(targetSide, piece.type);
    const square = choices[Math.floor(Math.random() * choices.length)];
    allocBoard[R.index(square)] = pieceChar(piece);
    const event = {
      number: allocIndex + 1,
      allocator: allocTurn,
      target: targetSide,
      piece: {...piece},
      square
    };
    allocLog.push(event);
    latestReveal = event;
    allocIndex++;
    render();
    sayToast(`${colorWord(piece.color)} ${pieceNames[piece.type]} revealed · ${colorWord(targetSide)} side`);
    if (allocIndex >= 30) {
      startMatch();
      return;
    }
    allocTurn = allocTurn === 'w' ? 'b' : 'w';
    render();
    maybeCpuAllocation();
  }
  function maybeCpuAllocation() {
    if (phase !== 'allocation' || !isCpuAllocationTurn() || cpuThinking) return;
    cpuThinking = true;
    render();
    cpuTimer = setTimeout(() => {
      cpuThinking = false;
      const piece = pieceBag[allocIndex];
      const options = validAllocationTargets(piece);
      if (!options.length) {
        sayToast('No available matching slot. Restarting allocation.');
        beginAllocation();
        return;
      }
      // The CPU uses only the available-side information, not the hidden piece identity.
      const target = options[Math.floor(Math.random() * options.length)];
      allocatePiece(target, true);
    }, 850 + Math.random() * 450);
  }
  function castleRights(board) {
    let c = 0;
    if (board[R.index('e1')] === 'K') {
      if (board[R.index('h1')] === 'R') c |= 1;
      if (board[R.index('a1')] === 'R') c |= 2;
    }
    if (board[R.index('e8')] === 'k') {
      if (board[R.index('h8')] === 'r') c |= 4;
      if (board[R.index('a8')] === 'r') c |= 8;
    }
    return c;
  }
  function startMatch() {
    clearTimers();
    const start = { b:allocBoard.slice(), t:1, c:castleRights(allocBoard), ep:-1, half:0, full:1, i:-1 };
    gameHistory = [start];
    moveRecords = [];
    selectedSquare = null;
    pendingPromotion = null;
    lastMove = null;
    phase = 'play';
    render();
    const status = R.gameStatus(gameHistory);
    if (status.done) sayToast(status.text);
    maybeCpuMove();
  }
  function squarePiece(board, square) { return board[R.index(square)]; }
  function getMoveOptions() {
    const game = currentGame();
    if (!game || selectedSquare === null) return [];
    return R.legal(game).filter(m => m[0] === selectedSquare);
  }
  function handleSquareClick(square) {
    if (phase !== 'play' || pendingPromotion || cpuThinking) return;
    const game = currentGame();
    if (!game || R.gameStatus(gameHistory).done || isCpuGameTurn()) return;
    const target = R.index(square);
    const legalMoves = R.legal(game);
    if (selectedSquare !== null) {
      const toMoves = legalMoves.filter(m => m[0] === selectedSquare && m[1] === target);
      if (toMoves.length > 1) {
        pendingPromotion = toMoves;
        render();
        return;
      }
      if (toMoves.length === 1) {
        playMove(toMoves[0]);
        return;
      }
    }
    if (R.side(game.b[target]) === game.t) {
      selectedSquare = target;
      render();
    } else {
      selectedSquare = null;
      render();
    }
  }
  function playMove(move, byCpu = false) {
    const game = currentGame();
    if (!game) return;
    const label = R.moveLabel(game, move);
    const next = R.apply(game, move);
    gameHistory.push(next);
    moveRecords.push({label, from:R.sq(move[0]), to:R.sq(move[1]), san:R.san(game, move)});
    lastMove = {from:move[0],to:move[1]};
    selectedSquare = null;
    pendingPromotion = null;
    cpuThinking = false;
    render();
    const status = R.gameStatus(gameHistory);
    if (status.done) {
      sayToast(status.text);
      return;
    }
    if (byCpu) sayToast('Computer played ' + label);
    maybeCpuMove();
  }
  function scoreMove(game, move) {
    const captured = game.b[move[1]] !== '.' ? game.b[move[1]].toLowerCase() : (move[3] === 'ep' ? 'p' : null);
    const moving = game.b[move[0]].toLowerCase();
    const next = R.apply(game, move);
    let score = Math.random() * 18;
    if (captured) score += (pieceValues[captured] || 0) * 0.9 - (pieceValues[moving] || 0) * 0.06;
    if (move[2]) score += (pieceValues[move[2]] || 0) - 100;
    if (R.checked(next)) {
      const replies = R.legal(next);
      score += replies.length ? 35 : 100000;
    }
    // Small preference for central squares and developing pieces away from the edge.
    const file = move[1] & 7, rank = move[1] >> 4;
    score += (3.5 - Math.abs(3.5-file) + 3.5 - Math.abs(3.5-rank)) * 2;
    return score;
  }
  function chooseCpuMove(game) {
    const moves = R.legal(game);
    if (!moves.length) return null;
    let best = -Infinity, candidates = [];
    for (const m of moves) {
      const score = scoreMove(game, m);
      if (score > best + 0.001) { best=score; candidates=[m]; }
      else if (Math.abs(score-best)<0.001) candidates.push(m);
    }
    return candidates[Math.floor(Math.random()*candidates.length)];
  }
  function maybeCpuMove() {
    if (phase !== 'play' || !isCpuGameTurn() || cpuThinking) return;
    const status = R.gameStatus(gameHistory);
    if (status.done) return;
    cpuThinking = true;
    render();
    cpuTimer = setTimeout(() => {
      const game = currentGame();
      const move = chooseCpuMove(game);
      cpuThinking = false;
      if (move) playMove(move, true);
    }, 700 + Math.random() * 500);
  }
  function undoMove() {
    if (phase !== 'play' || gameHistory.length <= 1) return;
    clearTimers();
    let remove = 1;
    if (mode === 'cpu') {
      const game = currentGame();
      // If it is the human's turn, the previous pair is usually human + CPU.
      if ((game.t === 1 ? 'w' : 'b') === humanColor && gameHistory.length >= 3) remove = 2;
    }
    gameHistory.splice(Math.max(1,gameHistory.length-remove), remove);
    moveRecords.splice(Math.max(0,moveRecords.length-remove), remove);
    const previous = gameHistory[gameHistory.length-1];
    lastMove = moveRecords.length ? {from:R.index(moveRecords[moveRecords.length-1].from),to:R.index(moveRecords[moveRecords.length-1].to)} : null;
    selectedSquare = null; pendingPromotion = null;
    render();
    maybeCpuMove();
  }
  function occupiedCount(side) {
    let n = 1;
    for (const type of ['p','r','n','b','q']) n += slots[side][type].filter(s => allocBoard[R.index(s)] !== '.').length;
    return n;
  }
  function renderHome() {
    main.innerHTML = `
      <section class="screen">
        <div class="hero">
          <div class="eyebrow">A new way to play chess</div>
          <h1>The board is set.<br><em>But not by you.</em></h1>
          <p>Thirty mystery pieces. Two players choosing where they land. Their colour decides who controls them, not the side of the board they occupy.</p>
        </div>
        <div class="mode-grid">
          <button class="mode-card ${mode==='local'?'selected':''}" data-action="mode-local">
            <div class="mode-icon">♟ ♞</div><h2>Two players</h2><p>Play together on one device. Take turns choosing where each mystery piece belongs.</p>
          </button>
          <button class="mode-card ${mode==='cpu'?'selected':''}" data-action="mode-cpu">
            <div class="mode-icon">✦</div><h2>Solo vs computer</h2><p>Play the allocation phase and the match against a casual computer opponent.</p>
          </button>
        </div>
        <div class="setup-panel">
          ${mode==='local' ? `
            <div class="field"><label for="whiteName">White player</label><input id="whiteName" maxlength="18" value="${escapeHtml(playerNames.w)}" placeholder="Player 1" /></div>
            <div class="field"><label for="blackName">Black player</label><input id="blackName" maxlength="18" value="${escapeHtml(playerNames.b)}" placeholder="Player 2" /></div>
          ` : `
            <div class="field"><label>Your side</label><div class="side-choice"><button class="${humanColor==='w'?'active':''}" data-action="human-white">Play White</button><button class="${humanColor==='b'?'active':''}" data-action="human-black">Play Black</button></div></div>
            <div class="field"><label>Your opponent</label><input value="Computer · Casual" disabled /></div>
          `}
          <div class="setup-actions"><button class="btn btn-primary" data-action="start">Start new game <span>→</span></button></div>
        </div>
        <p class="setup-note">Rules in this build: original piece colour controls movement. Pieces are placed in vacant matching-type starting slots. White allocates first; the actual chess match also starts with White.</p>
      </section>`;
  }
  function renderBoard(board, interactive) {
    let html = '<div class="board-grid" role="grid" aria-label="Chess board">';
    const targets = interactive ? getMoveOptions().map(m=>m[1]) : [];
    for (let r=0;r<8;r++) {
      for (let f=0;f<8;f++) {
        const i = r*16+f;
        const piece = board[i];
        const square = R.sq(i);
        const light = ((r+f)%2)===0;
        const selected = selectedSquare===i;
        const canMove = targets.includes(i);
        const isCapture = canMove && piece!=='.';
        const last = lastMove && (lastMove.from===i || lastMove.to===i);
        let classes = `square ${light?'light':'dark'}`;
        if (selected) classes+=' selected';
        if (last) classes+=' '+(lastMove.from===i?'last-from':'last-to');
        html += `<button class="${classes}" data-square="${square}" aria-label="${square}${piece!=='.'?' '+pieceNames[piece.toLowerCase()]:''}">`;
        if (canMove) html += isCapture ? '<span class="capture-ring"></span>' : '<span class="move-dot"></span>';
        if (piece!=='.') html += `<span class="piece ${R.side(piece)===1?'white':'black'}">${glyph[piece]}</span>`;
        if (f===0) html += `<span class="coord rank">${8-r}</span>`;
        if (r===7) html += `<span class="coord file">${'abcdefgh'[f]}</span>`;
        html += '</button>';
      }
    }
    html += '</div>';
    return html;
  }
  function renderReveal() {
    if (!latestReveal) return '';
    const p = latestReveal.piece;
    const char = pieceChar(p);
    return `<div class="reveal-card"><div class="reveal-symbol ${p.color==='w'?'piece white':'piece black'}">${glyph[char]}</div><div><strong>${colorWord(p.color)} ${pieceNames[p.type]} revealed</strong><small>Placed at ${latestReveal.square} · ${colorWord(latestReveal.target)} starting side · ${colorWord(p.color)} controls it</small></div></div>`;
  }
  function renderAllocationPanel() {
    const currentPiece = pieceBag[allocIndex];
    const cpuTurn = isCpuAllocationTurn();
    const valid = currentPiece ? validAllocationTargets(currentPiece) : [];
    const currentName = playerLabel(allocTurn);
    return `
      <section class="side-card">
        <div class="phase-top"><span class="phase-tag">01 / Allocation</span><span class="micro-label">${allocIndex}/30</span></div>
        <h2 class="turn-title">${allocIndex>=30?'Allocation complete':`${colorWord(allocTurn)} chooses`}</h2>
        <p class="turn-subtitle">${cpuTurn ? '<span class="cpu-thinking">Computer is choosing a side…</span>' : `${escapeHtml(currentName)}: the piece is hidden. Choose which side's matching starting slot it should occupy.`}</p>
        <div class="progress-wrap"><div class="progress-label"><span>BOARD SETUP</span><span>${Math.round(allocIndex/30*100)}%</span></div><div class="progress"><div class="progress-fill" style="width:${allocIndex/30*100}%"></div></div></div>
        <div class="mystery-box"><div class="mystery-glyph">?</div><strong>Mystery piece</strong><small>Its type and colour are hidden until you choose.</small></div>
        <div class="allocation-buttons">
          <button class="alloc-btn" data-action="allocate-w" ${cpuTurn||!valid.includes('w')?'disabled':''}>Allocate to White</button>
          <button class="alloc-btn" data-action="allocate-b" ${cpuTurn||!valid.includes('b')?'disabled':''}>Allocate to Black</button>
        </div>
        ${renderReveal()}
        <div class="slot-status">
          <div class="slot-chip"><span>White slots</span><b>${occupiedCount('w')}/16</b></div>
          <div class="slot-chip"><span>Black slots</span><b>${occupiedCount('b')}/16</b></div>
        </div>
        <p class="control-note">A piece keeps its original colour. For example, a black bishop placed on White's side is still controlled by Black.</p>
      </section>
      <section class="side-card">
        <div class="log-title"><h3>Revealed pieces</h3><span>${allocLog.length} / 30</span></div>
        <div class="allocation-log">${allocLog.length ? allocLog.slice().reverse().slice(0,12).map(e=>`<div class="log-row"><span class="log-num">${String(e.number).padStart(2,'0')}</span><span class="log-piece"><span class="mini-piece ${e.piece.color==='w'?'piece white':'piece black'}">${glyph[pieceChar(e.piece)]}</span>${colorWord(e.piece.color)} ${pieceNames[e.piece.type]}</span><span class="log-target">${e.square} · ${e.target==='w'?'White':'Black'}</span></div>`).join('') : '<div class="muted-small">No pieces revealed yet. The first mystery piece is waiting.</div>'}</div>
      </section>`;
  }
  function renderMovePanel() {
    const game = currentGame();
    const status = R.gameStatus(gameHistory);
    const gameTurn = game.t === 1 ? 'w' : 'b';
    const cpuTurn = isCpuGameTurn();
    const moves = moveRecords.map((m,i)=>`<span class="move-ply ${i===moveRecords.length-1?'latest':''}">${m.label}</span>`).join('');
    return `
      <section class="side-card">
        <div class="phase-top"><span class="phase-tag">02 / Match</span><span class="micro-label">${moveRecords.length} plies</span></div>
        <div class="game-status ${status.done?'done':''} ${status.check?'check':''}">${cpuTurn && !status.done ? 'Computer is thinking…' : status.text}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px">
          <div class="slot-chip"><span>White</span><b>${escapeHtml(mode==='cpu'&&humanColor!=='w'?'CPU':playerNames.w)}</b></div>
          <div class="slot-chip"><span>Black</span><b>${escapeHtml(mode==='cpu'&&humanColor!=='b'?'CPU':playerNames.b)}</b></div>
        </div>
        <p class="control-note">${cpuTurn && !status.done ? '<span class="cpu-thinking">Computer is choosing a move.</span>' : `${colorWord(gameTurn)} controls every ${colorWord(gameTurn).toLowerCase()} piece, wherever it stands on the board.`}</p>
      </section>
      <section class="side-card">
        <div class="log-title"><h3>Move history</h3><span>${moveRecords.length ? 'LATEST FIRST' : 'EMPTY'}</span></div>
        <div class="move-list">${moves || '<span class="muted-small">The match has not started moving yet.</span>'}</div>
      </section>
      <section class="side-card">
        <div class="side-actions">
          <button class="btn btn-secondary" data-action="undo" ${gameHistory.length<=1?'disabled':''}>↶ Undo</button>
          <button class="btn btn-secondary" data-action="restart">Restart</button>
          <button class="btn btn-ghost" data-action="home">Exit</button>
        </div>
        <p class="control-note">Traditional movement, check, checkmate, en passant and promotion. Castling is available only when a same-colour rook occupies its original corner square.</p>
      </section>`;
  }
  function renderGame() {
    const board = phase==='allocation' ? allocBoard : currentGame().b;
    const interactive = phase==='play';
    const count = phase==='allocation' ? allocIndex : moveRecords.length;
    const title = phase==='allocation' ? 'Build the board' : 'The match begins';
    const sub = phase==='allocation' ? 'Choose a side for each mystery piece. The reveal happens immediately.' : 'The pieces are set. Their colours decide who moves them.';
    const turn = phase==='allocation' ? allocTurn : (currentGame().t===1?'w':'b');
    main.innerHTML = `
      <section class="screen game-screen">
        <div class="game-heading"><div><div class="eyebrow">${mode==='cpu'?'SOLO GAME':'LOCAL MULTIPLAYER'} · ${phase==='allocation'?'SETUP PHASE':'LIVE MATCH'}</div><h1>${title}</h1><p>${sub}</p></div><span class="version-pill">${phase==='allocation'?`${count} / 30 PIECES`:`${moveRecords.length} MOVES`}</span></div>
        <div class="game-layout">
          <section class="board-card">
            <div class="board-topline"><span class="player-label"><i class="player-dot black"></i> Black starting side</span><span>${phase==='allocation'?'MYSTERY ALLOCATION':'WHITE AT BOTTOM'}</span></div>
            ${renderBoard(board,interactive)}
            <div class="board-bottomline"><span class="player-label"><i class="player-dot"></i> White starting side</span><span>${phase==='allocation'?'KING POSITIONS FIXED':'SELECT A PIECE TO MOVE'}</span></div>
          </section>
          <aside class="side-column">${phase==='allocation'?renderAllocationPanel():renderMovePanel()}</aside>
        </div>
      </section>`;
    if (pendingPromotion) renderPromotionModal();
  }
  function renderPromotionModal() {
    const moves = pendingPromotion || [];
    if (!moves.length) return;
    const color = currentGame().t === 1 ? 'w' : 'b';
    const choices = moves.map(m=>`<button data-promotion="${m[2]}"><span class="piece ${color==='w'?'white':'black'}">${glyph[color==='w'?m[2].toUpperCase():m[2]]}</span><small>${pieceNames[m[2]]}</small></button>`).join('');
    const el = document.createElement('div'); el.className='promotion-overlay';
    el.innerHTML = `<div class="promotion-modal"><h3>Choose your promotion</h3><p>Your pawn reached the final rank. Which piece should it become?</p><div class="promotion-options">${choices}</div><div style="margin-top:14px;text-align:right"><button class="btn btn-ghost" data-action="cancel-promotion">Cancel</button></div></div>`;
    el.addEventListener('click', event => {
      const choice = event.target.closest('[data-promotion]');
      if (choice && pendingPromotion) {
        const move = pendingPromotion.find(m => m[2] === choice.dataset.promotion);
        if (move) playMove(move);
        el.remove();
        return;
      }
      if (event.target.closest('[data-action="cancel-promotion"]')) {
        pendingPromotion = null;
        el.remove();
        render();
      }
    });
    document.body.appendChild(el);
  }
  function render() {
    if (phase === 'home' || phase === 'setup') renderHome();
    else renderGame();
    renderToast();
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  document.querySelector('.brand')?.addEventListener('click', event => {
    event.preventDefault();
    clearTimers();
    phase = 'setup';
    selectedSquare = null;
    pendingPromotion = null;
    render();
  });

  main.addEventListener('input', event => {
    if (event.target.id === 'whiteName') playerNames.w = event.target.value.trim() || 'Player 1';
    if (event.target.id === 'blackName') playerNames.b = event.target.value.trim() || 'Player 2';
  });
  main.addEventListener('click', event => {
    const promotion = event.target.closest('[data-promotion]');
    if (promotion && pendingPromotion) {
      const move = pendingPromotion.find(m=>m[2]===promotion.dataset.promotion);
      if (move) playMove(move);
      document.querySelector('.promotion-overlay')?.remove();
      return;
    }
    const square = event.target.closest('[data-square]');
    if (square) { handleSquareClick(square.dataset.square); return; }
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'mode-local') { mode='local'; render(); }
    else if (action === 'mode-cpu') { mode='cpu'; render(); }
    else if (action === 'human-white') { humanColor='w'; render(); }
    else if (action === 'human-black') { humanColor='b'; render(); }
    else if (action === 'start') {
      if (mode==='local') {
        playerNames.w = document.getElementById('whiteName')?.value.trim() || 'Player 1';
        playerNames.b = document.getElementById('blackName')?.value.trim() || 'Player 2';
      } else {
        playerNames.w = humanColor==='w' ? 'You' : 'Computer';
        playerNames.b = humanColor==='b' ? 'You' : 'Computer';
      }
      beginAllocation();
    }
    else if (action === 'allocate-w') allocatePiece('w');
    else if (action === 'allocate-b') allocatePiece('b');
    else if (action === 'undo') undoMove();
    else if (action === 'restart') beginAllocation();
    else if (action === 'home') { clearTimers(); phase='setup'; selectedSquare=null; pendingPromotion=null; render(); }
    else if (action === 'cancel-promotion') { pendingPromotion=null; document.querySelector('.promotion-overlay')?.remove(); render(); }
  });

  // Start at the mode selector.
  phase = 'setup';
  render();
})();
