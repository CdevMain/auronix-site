// Toca a conversa do topo uma vez, quando ela aparece na tela.
(function () {
  var chat = document.querySelector('.chat');
  if (!chat) return;
  var play = function () { chat.classList.add('is-playing'); };
  if (!('IntersectionObserver' in window)) return play();
  var io = new IntersectionObserver(function (entries) {
    if (entries.some(function (e) { return e.isIntersecting; })) { play(); io.disconnect(); }
  }, { threshold: 0.35 });
  io.observe(chat);
})();
