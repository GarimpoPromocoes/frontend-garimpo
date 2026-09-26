import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { StatusService } from '../../../core/services/status.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { ConexoesService } from '../../../core/services/conexoes.service';
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
  private conexoes = inject(ConexoesService);
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

  // Credenciais de API do Telegram (api_id / api_hash) que o proprio cliente
  // informa aqui — cada conta do Telegram exige as suas (my.telegram.org).
  protected readonly apiId = signal('');
  protected readonly apiHash = signal('');
  protected readonly credsSalvo = signal(false);
  protected readonly credsApiId = signal<string | null>(null);
  protected readonly editandoCreds = signal(false);
  protected readonly salvandoCreds = signal(false);

  protected readonly apiIdValido = computed(() => /^\d{3,15}$/.test(this.apiId().trim()));
  protected readonly apiHashValido = computed(() => /^[a-f0-9]{32}$/i.test(this.apiHash().trim()));
  protected readonly podeConectarCreds = computed(() => this.apiIdValido() && this.apiHashValido());
  /** Mostra o formulario de api_id/api_hash quando ainda nao ha credencial salva (ou ao editar). */
  protected readonly precisaCreds = computed(() => !this.credsSalvo() || this.editandoCreds());

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
      if (this.ui.aberto()) void this.carregarCreds();
    });
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

  private async carregarCreds(): Promise<void> {
    const c = await this.conexoes.credenciaisTelegram();
    this.credsSalvo.set(c.salvo);
    this.credsApiId.set(c.apiId);
    if (c.salvo && c.apiId) this.apiId.set(c.apiId);
    this.editandoCreds.set(false);
  }

  editarCreds(): void {
    this.editandoCreds.set(true);
    this.apiHash.set('');
  }

  async conectar(): Promise<void> {
    this.erro.set(null);
    this.jobsService.erroTelegram.set(null);

    // Sem credencial salva (ou trocando): salva o api_id/api_hash antes do QR.
    if (this.precisaCreds()) {
      if (!this.podeConectarCreds()) {
        this.erro.set('Confira o api_id (só números) e o api_hash (32 caracteres de a–f e números).');
        return;
      }
      this.salvandoCreds.set(true);
      const salvo = await this.conexoes.salvarCredenciaisTelegram(this.apiId().trim(), this.apiHash().trim());
      this.salvandoCreds.set(false);
      if (!salvo.ok) {
        this.erro.set(salvo.erro ?? null);
        return;
      }
      this.credsSalvo.set(true);
      this.credsApiId.set(this.apiId().trim());
      this.editandoCreds.set(false);
      this.apiHash.set('');
    }

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
    this.editandoCreds.set(false);
    this.apiHash.set('');
    this.jobsService.erroTelegram.set(null);
    this.ui.fechar();
  }
}
