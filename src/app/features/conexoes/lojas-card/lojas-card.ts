import { Component, OnInit, computed, inject } from '@angular/core';
import { ConexoesService, Provedor } from '../../../core/services/conexoes.service';
import { LojasUiService } from '../../../core/services/lojas-ui.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { AvisosService } from '../../../core/services/avisos.service';

/** ok = funcionando; atencao = funcionava e caiu (precisa entrar de novo); off = nunca conectada. */
type EstadoLoja = 'ok' | 'atencao' | 'off';

interface Loja {
  provedor: Provedor;
  nome: string;
  logo: string;
  conectada: boolean;
  estado: EstadoLoja;
  /** Por que caiu (só em 'atencao'). */
  motivo: string;
}

/** Loja que aparece na grade mas ainda não tem integração. */
interface LojaEmBreve {
  id: string;
  nome: string;
  logo: string;
}

@Component({
  selector: 'app-lojas-card',
  standalone: true,
  templateUrl: './lojas-card.html',
})
export class LojasCard implements OnInit {
  private conexoes = inject(ConexoesService);
  protected verificacao = inject(VerificacaoService);
  protected lojasUi = inject(LojasUiService);
  private confirmacao = inject(ConfirmacaoService);
  private avisos = inject(AvisosService);

  // Ainda em desenvolvimento: ficam visíveis, mas o clique só avisa.
  // Quando uma ficar pronta, ela sai daqui e entra em `lojas` com o provedor.
  protected readonly emBreve: LojaEmBreve[] = [
    { id: 'shein', nome: 'Shein', logo: 'lojas/shein.png' },
    { id: 'nike', nome: 'Nike', logo: 'lojas/nike.png' },
    { id: 'netshoes', nome: 'Netshoes', logo: 'lojas/netshoes.png' },
    { id: 'adidas', nome: 'Adidas', logo: 'lojas/adidas.png' },
    { id: 'centauro', nome: 'Centauro', logo: 'lojas/centauro.png' },
  ];

  protected readonly erro = computed(() => this.conexoes.erro());

  protected readonly lojas = computed<Loja[]>(() => {
    const conexao = (p: Provedor) => this.conexoes.statusDe(p);
    // Loja que já funcionou e caiu vira um aviso no sino: aqui ela aparece como "precisa entrar de novo".
    const avisoDe = (p: Provedor) => this.avisos.avisos().find((a) => a.origem === p);
    const completar = (l: Pick<Loja, 'provedor' | 'nome' | 'logo' | 'conectada'>): Loja => {
      const aviso = avisoDe(l.provedor);
      return {
        ...l,
        estado: aviso ? 'atencao' : l.conectada ? 'ok' : 'off',
        motivo: aviso?.texto ?? '',
      };
    };

    const base: Pick<Loja, 'provedor' | 'nome' | 'logo' | 'conectada'>[] = [
      {
        provedor: 'mercadolivre',
        nome: 'Mercado Livre',
        logo: 'lojas/mercadolivre.svg',
        // O ML só tem essa sessão de navegador — sem ela, nada funciona.
        conectada: this.verificacao.mercadoLivreConectado(),
      },
      {
        provedor: 'amazon',
        nome: 'Amazon',
        logo: 'lojas/amazon.svg',
        // Na Amazon quem garante comissão é a tag de associado; o login só
        // acrescenta o link curto. A tag não "cai" — não precisa de checagem
        // ao vivo pra decidir esse badge.
        conectada: conexao('amazon')?.status === 'conectado',
      },
      {
        provedor: 'shopee',
        nome: 'Shopee',
        logo: 'lojas/shopee.svg',
        // Shopee e' 100% API: estar conectada = as chaves ainda serem aceitas.
        conectada: this.verificacao.shopeeConectado(),
      },
    ];
    return base.map(completar);
  });

  /** O aviso do topo, só quando tem algo a resolver. Tudo certo: nada (os cartões já mostram). */
  protected readonly resumo = computed(() => {
    const lojas = this.lojas();
    const ok = lojas.filter((l) => l.estado === 'ok').length;
    const caida = lojas.find((l) => l.estado === 'atencao') ?? null;
    if (caida) {
      return {
        tom: 'atencao',
        titulo: `${ok} de ${lojas.length} lojas funcionando`,
        texto: `${caida.nome} precisa que você entre de novo. As outras seguem normalmente.`,
        resolver: caida,
      };
    }
    if (!ok) {
      return {
        tom: 'atencao',
        titulo: 'Nenhuma loja conectada',
        texto: 'Conecte pelo menos uma loja para o robô gerar os seus links de afiliado.',
        resolver: null,
      };
    }
    return null;
  });

  ngOnInit(): void {
    this.conexoes.carregar();
  }

  abrir(provedor: Provedor): void {
    this.lojasUi.abrir(provedor);
  }

  avisarEmBreve(nome: string): void {
    void this.confirmacao.pedir({
      titulo: `${nome} ainda não está disponível`,
      texto: `A integração com a ${nome} está em desenvolvimento. Assim que ficar pronta, é só voltar aqui e conectar.`,
      confirmar: 'Entendi',
      soAviso: true,
    });
  }

  recarregar(): void {
    this.conexoes.carregar();
  }
}
