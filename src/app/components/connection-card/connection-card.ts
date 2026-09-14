import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import * as QRCode from 'qrcode';
import { StatusService } from '../../services/status.service';
import { JobsService, JobTipo } from '../../services/jobs.service';
import { environment } from '../../../environments/environment';

type Servico = 'ml' | 'whatsapp';

@Component({
  selector: 'app-connection-card',
  standalone: true,
  templateUrl: './connection-card.html',
  // Durante o login do ML o card ocupa a largura toda: a tela remota é de
  // 1366px e, espremida em meia coluna, fica pequena demais para alguém
  // conseguir ler e digitar — que é justamente o que se faz nela.
  host: { '[class.card-largo]': 'servico() === "ml" && esteCardEstaRodando()' },
})
export class ConnectionCard {
  servico = input.required<Servico>();

  protected statusService = inject(StatusService);
  protected jobsService = inject(JobsService);
  private sanitizer = inject(DomSanitizer);

  protected readonly conectado = computed(() => {
    const s = this.statusService.status();
    if (!s) return false;
    return this.servico() === 'ml' ? s.mercadoLivre.conectado : s.whatsapp.conectado;
  });

  private readonly tiposDoCard = computed<JobTipo[]>(() =>
    this.servico() === 'ml' ? ['login-ml', 'trocar-ml'] : ['trocar-zap'],
  );

  protected readonly esteCardEstaRodando = computed(() => {
    const tipo = this.jobsService.tipo();
    return this.jobsService.rodando() && tipo !== null && this.tiposDoCard().includes(tipo);
  });

  protected readonly outroJobRodando = computed(
    () => this.jobsService.rodando() && !this.esteCardEstaRodando(),
  );

  protected readonly ehLoginMl = computed(() => this.jobsService.tipo() === 'login-ml' || this.jobsService.tipo() === 'trocar-ml');

  protected readonly titulo = computed(() => (this.servico() === 'ml' ? 'Mercado Livre' : 'WhatsApp'));

  // Qual número está conectado. Sem isso, quem tem mais de um chip não tinha
  // como saber por qual número as promoções estavam saindo.
  // Só aparece enquanto a conexão está de pé: mostrar um número embaixo de
  // "Não conectado" faria o card se contradizer.
  protected readonly contaWhatsapp = computed(() => {
    if (this.servico() !== 'whatsapp' || !this.conectado()) return null;
    const wpp = this.statusService.status()?.whatsapp;
    if (!wpp?.numero) return null;
    return { numero: this.formatarNumero(wpp.numero), nome: wpp.nome };
  });

  // "5511999998888" -> "+55 (11) 99999-8888". Se vier em formato inesperado,
  // mostra como veio em vez de arriscar exibir um número errado.
  private formatarNumero(bruto: string): string {
    const d = bruto.replace(/\D/g, '');
    const m = d.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
    return m ? `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}` : bruto;
  }
  protected readonly erro = signal<string | null>(null);

  // O login do ML abre um navegador DENTRO do container — só dá pra ver/usar
  // pela tela remota (noVNC), que fica num endereço/porta diferente do
  // dashboard. QR Code (e o link) evitam ter que descobrir/digitar essa URL
  // na mão — abre "/" que já auto-conecta na tela remota (ver novnc-index.html).
  //
  // A PORTA vem do job: cada sessão de login ganha a sua (ver
  // api-bot/src/displays.js). Antes era uma porta fixa compartilhada, o que
  // com mais de um cliente significaria abrir a tela de login de outra pessoa.
  //
  // environment.vncBase (configurado via NG_APP_VNC_BASE na Vercel) tem
  // prioridade: quando o front e a api estão em domínios diferentes (ex.:
  // Vercel + túnel local), não dá pra assumir "mesmo host da página" — precisa
  // da URL completa configurada à parte. Em dev local (mesmo domínio via
  // docker/nginx) o fallback continua valendo.
  // null enquanto o servidor ainda não informou a porta desta sessão. O
  // template só monta o iframe quando há URL: iframe que falha ao carregar
  // não tenta de novo, então montá-lo antes da tela existir o deixaria em
  // branco para sempre.
  protected readonly novncUrl = computed<string | null>(() => {
    const porta = this.jobsService.vncPort();
    if (!porta) return null;
    if (environment.vncBase) return `${environment.vncBase.replace(/\/$/, '')}:${porta}/`;
    return `${window.location.protocol}//${window.location.hostname}:${porta}/`;
  });
  protected readonly novncQrCode = signal<string | null>(null);

  // QR do WhatsApp desenhado como IMAGEM. Antes o único QR era o de
  // caracteres no log — apontar a câmera do celular pra aquilo, dentro de
  // uma caixinha de texto rolável, era praticamente impossível.
  protected readonly qrWhatsappImagem = signal<string | null>(null);

  // Há um QR esperando ser lido = o pareamento ainda não terminou, mesmo que
  // a pasta de sessão já exista em disco (é o que a badge usava até aqui).
  protected readonly aguardandoPareamento = computed(
    () => this.servico() === 'whatsapp' && this.esteCardEstaRodando() && !!this.jobsService.qrWhatsapp(),
  );

  // A tela do login roda DENTRO do painel (iframe), não em outra aba: abrir
  // aba nova e mandar o usuário achar um endereço era o passo que mais
  // travava quem não é técnico. O QR Code continua abaixo, só como saída
  // para quem preferir logar pelo celular.
  //
  // bypassSecurityTrust é necessário porque a URL é montada em runtime (a
  // porta muda a cada sessão); ela não vem do usuário, é sempre a porta que
  // o próprio servidor informou no status do job.
  protected readonly novncUrlSegura = computed<SafeResourceUrl | null>(() => {
    const url = this.novncUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  constructor() {
    effect(() => {
      const precisaQr = this.servico() === 'ml' && this.esteCardEstaRodando();
      if (!precisaQr) {
        this.novncQrCode.set(null);
        return;
      }
      const url = this.novncUrl();
      if (!url) {
        this.novncQrCode.set(null);
        return;
      }
      QRCode.toDataURL(url, { margin: 1, width: 220 })
        .then((dataUrl) => this.novncQrCode.set(dataUrl))
        .catch(() => this.novncQrCode.set(null));
    });

    // O WhatsApp troca o QR de tempos em tempos; cada novo conteúdo redesenha
    // a imagem. Maior que o do noVNC porque este é para ser lido pela câmera
    // de um celular a alguma distância da tela.
    effect(() => {
      const conteudo = this.jobsService.qrWhatsapp();
      if (this.servico() !== 'whatsapp' || !conteudo) {
        this.qrWhatsappImagem.set(null);
        return;
      }
      QRCode.toDataURL(conteudo, { margin: 2, width: 300 })
        .then((dataUrl) => this.qrWhatsappImagem.set(dataUrl))
        .catch(() => this.qrWhatsappImagem.set(null));
    });
  }

  async conectar(): Promise<void> {
    this.erro.set(null);
    if (this.servico() === 'ml') {
      const r = await this.jobsService.iniciar('login-ml');
      if (!r.ok) this.erro.set(r.erro ?? null);
    } else {
      if (this.conectado()) {
        const ok = window.confirm(
          'Isso vai desconectar o WhatsApp atual e pedir um novo QR Code. Continuar?',
        );
        if (!ok) return;
      }
      const r = await this.jobsService.iniciar('trocar-zap');
      if (!r.ok) this.erro.set(r.erro ?? null);
    }
  }

  async trocarContaMl(): Promise<void> {
    this.erro.set(null);
    const ok = window.confirm('Isso apaga a sessão atual do Mercado Livre e pede um novo login. Continuar?');
    if (!ok) return;
    const r = await this.jobsService.iniciar('trocar-ml');
    if (!r.ok) this.erro.set(r.erro ?? null);
  }

  async concluirLogin(): Promise<void> {
    await this.jobsService.confirmarEnter();
  }

  async cancelar(): Promise<void> {
    await this.jobsService.parar();
  }
}
