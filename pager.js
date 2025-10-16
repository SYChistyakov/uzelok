class Pager {
  constructor() {
    this.state = {};
  }
  
  showPage(id) {
    document.querySelectorAll('.page').forEach(function(p) {
      p.classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
    this.state.page = id;
  }
}

window.Pager = Pager;