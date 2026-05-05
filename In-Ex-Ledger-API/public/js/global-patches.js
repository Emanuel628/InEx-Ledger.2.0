/* Global app behavior patches loaded after global.js.
   Temporarily no-op.

   The sidebar multi-select behavior needs to live inside global.js where the
   dynamic sidebar is rendered. Loading it as a second observer script can fight
   the sidebar re-render cycle and break the menu.
*/
(function () {
  // Intentionally empty.
})();
