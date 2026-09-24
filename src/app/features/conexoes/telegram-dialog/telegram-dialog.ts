import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { StatusService } from '../../../core/services/status.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { TelegramUiService } from '../../../core/services/telegram-ui.service';

/**
 * A janela de conexão do Telegram — mesmo formato da do WhatsApp: QR Code na
 * tela, a pessoa lê com o celular e a sessão fica salva. Se a conta tiver
 * verificação em duas etapas, a senha é pedida aqui mesmo.
 */
@Component({
  selector: 'app-telegram-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './telegram-dialog.html',
})
export class TelegramDialog {
  protected statusService = inject(StatusService);
  protected jobsService = inject(JobsService);
  protected verificacao = inject(VerificacaoService);
  private confirmacao = inject(ConfirmacaoService);
  private ui = inject(TelegramUiService);

  protected readonly conectando = computed(
    () => this.jobsService.rodando() && this.jobsService.tipo() === 'conectar-telegram',
  );
  protected readonly desconectando = computed(
    () => this.jobsService.rodando() && this.jobsService.tipo() === 'desconectar-telegram',
  );
  protected readonly pedidoSenha = computed(() => (this.conectando() ? this.jobsService.senhaTelegram() : null));

  protected readonly aberto = computed(() => this.ui.aberto() || this.conectando() || this.desconectando());
  protected readonly conectado = computed(() => this.verificacao.telegramConectado());

  protected readonly qrImagem = signal<string | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly senha = signal('');
  protected readonly enviandoSenha = signal(false);

  /** Erro do último "Conectar" (o robô já terminou, mas a janela mostra o motivo). */
  protected readonly erroConexao = computed(() =>
    !this.conectando() && !this.conectado() ? this.jobsService.erroTelegram() : null,
  );

  protected readonly conta = computed(() => {
    if (!this.conectado()) return null;
    const tg = this.statusService.status()?.telegram;
    if (!tg) return null;
    const principal = tg.nome || (tg.usuario ? '@' + tg.usuario : null) || (tg.numero ? '+' + tg.numero : null);
    if (!principal) return null;
    const extra = tg.nome && tg.usuario ? '@' + tg.usuario : null;
    return { principal, extra };
  });

  constructor() {
    effect(() => {
      const conteudo = this.jobsService.qrTelegram();
      if (!conteudo) {
        this.qrImagem.set(null);
        return;
      }
      QRCode.toDataURL(conteudo, { margin: 2, width: 300 })
        .then((dataUrl) => this.qrImagem.set(dataUrl))
        .catch(() => this.qrImagem.set(null));
    });
  }

  async conectar(): Promise<void> {
    this.erro.set(null);
    this.jobsService.erroTelegram.set(null);
    this.jobsService.esquecerVerificacao('telegram');
    const r = await this.jobsService.iniciar('conectar-telegram');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  async enviarSenha(): Promise<void> {
    const s = this.senha();
    if (!s || this.enviandoSenha()) return;
    this.enviandoSenha.set(true);
    const r = await this.jobsService.enviarSenhaTelegram(s);
    this.enviandoSenha.set(false);
    this.senha.set('');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  async desconectar(): Promise<void> {
    const ok = await this.confirmacao.pedir({
      titulo: 'Desconectar o Telegram?',
      texto: 'As promoções param de sair nos grupos do Telegram até você conectar de novo.',
      confirmar: 'Desconectar',
      perigo: true,
    });
    if (!ok) return;

    this.erro.set(null);
    this.jobsService.esquecerVerificacao('telegram');
    const r = await this.jobsService.iniciar('desconectar-telegram');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  /** O X (e o clique fora) no meio da conexão vale por cancelar. */
  async aoFechar(): Promise<void> {
    if ((this.conectando() || this.desconectando()) && this.jobsService.rodando()) {
      await this.jobsService.parar();
    }
    this.erro.set(null);
    this.senha.set('');
    this.jobsService.erroTelegram.set(null);
    this.ui.fechar();
  }
}
