/* 
 Simple pause menu overlay.
 Shows two buttons: Resume (close menu) and Surrender (destroy local player).
*/
class PauseMenu {
    constructor(container, onSurrenderCb) {
        this.container = container || document.body;
        this.onSurrenderCb = onSurrenderCb;
        this._createElements();
        this.visible = false;
    }

    _createElements() {
        this.el = document.createElement('div');
        this.el.id = 'pauseMenu';
        this.el.style.position = 'absolute';
        this.el.style.left = '0';
        this.el.style.top = '0';
        this.el.style.width = '100%';
        this.el.style.height = '100%';
        this.el.style.display = 'none';
        this.el.style.alignItems = 'center';
        this.el.style.justifyContent = 'center';
        this.el.style.zIndex = '50';
        this.el.style.pointerEvents = 'auto';

        const backdrop = document.createElement('div');
        backdrop.style.position = 'absolute';
        backdrop.style.left = '0';
        backdrop.style.top = '0';
        backdrop.style.width = '100%';
        backdrop.style.height = '100%';
        backdrop.style.background = 'rgba(0,0,0,0.55)';
        this.el.appendChild(backdrop);

        const box = document.createElement('div');
        box.style.minWidth = '260px';
        box.style.padding = '18px';
        box.style.borderRadius = '10px';
        box.style.background = 'rgba(255,255,255,0.95)';
        box.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
        box.style.display = 'flex';
        box.style.flexDirection = 'column';
        box.style.gap = '12px';
        box.style.alignItems = 'center';
        box.style.pointerEvents = 'auto';

        const title = document.createElement('div');
        title.textContent = 'Paused';
        title.style.fontFamily = 'Cabin Sketch, Irish Grover, cursive';
        title.style.fontSize = '24px';
        title.style.color = '#111';
        box.appendChild(title);

        const resumeBtn = document.createElement('button');
        resumeBtn.textContent = 'Resume';
        resumeBtn.style.padding = '10px 18px';
        resumeBtn.style.fontSize = '16px';
        resumeBtn.style.cursor = 'pointer';
        resumeBtn.addEventListener('click', () => this.hide());
        box.appendChild(resumeBtn);

        const surrenderBtn = document.createElement('button');
        surrenderBtn.textContent = 'Surrender (Select Vehicle)';
        surrenderBtn.style.padding = '10px 18px';
        surrenderBtn.style.fontSize = '16px';
        surrenderBtn.style.cursor = 'pointer';
        surrenderBtn.style.background = '#d9534f';
        surrenderBtn.style.color = 'white';
        surrenderBtn.addEventListener('click', () => {
            this.hide();
            if (typeof this.onSurrenderCb === 'function') this.onSurrenderCb();
        });
        box.appendChild(surrenderBtn);

        // Center box in container
        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.left = '50%';
        wrapper.style.top = '50%';
        wrapper.style.transform = 'translate(-50%, -50%)';
        wrapper.appendChild(box);
        this.el.appendChild(wrapper);

        this.container.appendChild(this.el);
    }

    show() {
        if (this.visible) return;
        this.el.style.display = 'flex';
        this.visible = true;
    }

    hide() {
        if (!this.visible) return;
        this.el.style.display = 'none';
        this.visible = false;
    }

    toggle() {
        if (this.visible) this.hide(); else this.show();
    }

    destroy() {
        if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
        this.el = null;
    }
}

export default PauseMenu;
