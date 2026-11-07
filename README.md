# Mystery Chess

A first playable prototype of the custom chess variation described in the chat.

## Run it

1. Extract the ZIP folder.
2. Open `index.html` in Chrome, Edge, or Firefox.
3. Choose **Two players** or **Solo vs computer** and start a game.

No installation or build tools are needed. The Google Fonts import is optional; the game still works with system fonts if fonts are unavailable.

## Rules implemented in this build

- White King starts on e1 and Black King on e8.
- The other 30 pieces (15 White and 15 Black) are shuffled into a hidden draw order.
- White chooses the destination side first, then Black, alternating for 30 allocations.
- The current piece is hidden until the allocator chooses White or Black.
- The selected piece is revealed immediately and put into a randomly chosen vacant starting slot of the matching piece type on that side.
- If a side has no vacant matching slot, that allocation button is disabled.
- A piece keeps its original colour. White controls all White pieces and Black controls all Black pieces, regardless of the side of the board on which a piece starts.
- The match uses chess movement, check/checkmate, en passant, promotion, and conditional castling.
- Two-player mode is local pass-and-play on one device. Solo mode uses a casual move-selecting computer opponent.

## Current prototype limits

- Online room codes, accounts, matchmaking, and real-time play across different devices are not included yet. Those need a shared backend and server-side move validation.
- The computer opponent is deliberately lightweight and is not a strong chess engine.
- The allocation phase is hidden in the interface, but this offline prototype is not cheat-proof against someone inspecting browser source or developer tools. A production online version should keep the hidden draw and allocation state on the server.
- Castling is only available when the king and a same-colour rook occupy their corresponding original corner/home squares and the normal path/check conditions are satisfied.
