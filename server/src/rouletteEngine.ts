import { Server } from 'socket.io';
import { applyBalanceDelta, getUser, addXp, bumpStat, maxStat } from './db';

interface UserBet {
  bets: Record<string, number>;
  total: number;
}

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export class RouletteEngine {
  private io?: Server;
  public phase: 'betting' | 'spinning' = 'betting';
  public phaseEndsAt: number = 0;
  private userBets = new Map<string, UserBet>(); // userId -> UserBet
  private history: number[] = [];
  private tickInterval?: NodeJS.Timeout;
  private playerInfo = new Map<string, { name: string; avatar: string }>(); // userId -> display info
  private viewers = new Set<string>(); // userIds currently watching

  public init(io: Server) {
    this.io = io;
    this.phaseEndsAt = Date.now() + 30000;
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => this.tick(), 1000);
  }

  public placeBet(userId: string, bets: Record<string, number>): boolean {
    const timeRemainingMs = this.phaseEndsAt - Date.now();
    if (this.phase !== 'betting' || timeRemainingMs <= 5000) return false;
    
    let totalAdded = 0;
    let ub = this.userBets.get(userId);
    if (!ub) {
      ub = { bets: {}, total: 0 };
      this.userBets.set(userId, ub);
    }
    
    for (const [zone, amt] of Object.entries(bets)) {
      ub.bets[zone] = (ub.bets[zone] || 0) + amt;
      totalAdded += amt;
      ub.total += amt;
    }
    
    return true;
  }

  public clearBets(userId: string): number {
    const timeRemainingMs = this.phaseEndsAt - Date.now();
    if (this.phase !== 'betting' || timeRemainingMs <= 5000) return 0;
    
    const ub = this.userBets.get(userId);
    if (!ub) return 0;
    
    const total = ub.total;
    this.userBets.delete(userId);
    return total; // Refund amount
  }
  
  public getBets(userId: string): Record<string, number> {
     return this.userBets.get(userId)?.bets || {};
  }

  public getState() {
    return {
      phase: this.phase,
      timeRemainingMs: Math.max(0, this.phaseEndsAt - Date.now()),
      history: this.history,
      players: this.getPlayersInfo()
    };
  }

  public joinTable(userId: string, name: string, avatar: string) {
    this.viewers.add(userId);
    this.playerInfo.set(userId, { name, avatar });
    this.broadcastPlayers();
  }

  public leaveTable(userId: string) {
    this.viewers.delete(userId);
    // Keep playerInfo around until end of round in case they have active bets
    if (!this.userBets.has(userId)) {
      this.playerInfo.delete(userId);
    }
    this.broadcastPlayers();
  }

  public getPlayersInfo() {
    const players: Array<{ id: string; name: string; avatar: string; totalBet: number; bets: Record<string, number> }> = [];
    // Include all viewers + anyone with active bets
    const allIds = new Set([...this.viewers, ...this.userBets.keys()]);
    for (const id of allIds) {
      const info = this.playerInfo.get(id);
      if (!info) continue;
      const ub = this.userBets.get(id);
      players.push({
        id,
        name: info.name,
        avatar: info.avatar,
        totalBet: ub?.total || 0,
        bets: ub?.bets || {}
      });
    }
    return players;
  }

  private broadcastPlayers() {
    if (!this.io) return;
    this.io.emit('roulette_players', this.getPlayersInfo());
  }

  private async tick() {
    if (!this.io) return;
    const now = Date.now();
    const remainingMs = this.phaseEndsAt - now;

    if (remainingMs <= 0) {
      if (this.phase === 'betting') {
        this.phase = 'spinning';
        this.phaseEndsAt = now + 15000; // 15 seconds for spinning animation and payouts
        await this.resolveSpin();
      } else if (this.phase === 'spinning') {
        this.phase = 'betting';
        this.phaseEndsAt = now + 30000; // 30s betting phase
        this.userBets.clear();
      }
    }
    
    // Always broadcast state so clients are perfectly synced
    this.io.emit('roulette_state', this.getState());
  }

  private async resolveSpin() {
    const resultNum = Math.floor(Math.random() * 37); // 0-36
    this.history = [resultNum, ...this.history].slice(0, 9);

    const resultsByUserId = new Map<string, any>();

    // We process all bets
    for (const [userId, ub] of this.userBets.entries()) {
      let winnings = 0;
      for (const [zone, amt] of Object.entries(ub.bets)) {
        if (zone === resultNum.toString()) winnings += amt * 36;
        else if (zone === 'red' && RED_NUMS.has(resultNum)) winnings += amt * 2;
        else if (zone === 'black' && resultNum !== 0 && !RED_NUMS.has(resultNum)) winnings += amt * 2;
        else if (zone === 'even' && resultNum !== 0 && resultNum % 2 === 0) winnings += amt * 2;
        else if (zone === 'odd' && resultNum % 2 !== 0) winnings += amt * 2;
        else if (zone === 'low' && resultNum >= 1 && resultNum <= 18) winnings += amt * 2;
        else if (zone === 'high' && resultNum >= 19 && resultNum <= 36) winnings += amt * 2;
        else if (zone.startsWith('dozen')) {
          const d = parseInt(zone.split('_')[1]);
          if (Math.ceil(resultNum / 12) === d && resultNum !== 0) winnings += amt * 3;
        }
        else if (zone.startsWith('col')) {
          const c = parseInt(zone.split('_')[1]); // 1, 2, 3
          if ((resultNum - c) % 3 === 0 && resultNum !== 0) winnings += amt * 3;
        }
      }

      if (winnings > 0) {
        await applyBalanceDelta(userId, winnings);
      }
      await addXp(userId, 10 + (winnings > ub.total ? 20 : 0));

      bumpStat(userId, 'roulette_rounds');
      bumpStat(userId, 'roulette_total_bet', ub.total);
      if (winnings > 0) {
        bumpStat(userId, 'roulette_total_won', winnings);
        maxStat(userId, 'roulette_biggest_win', winnings);
      }
      
      const dbUser = await getUser(userId);
      resultsByUserId.set(userId, { 
        win: winnings, 
        net: winnings - ub.total, 
        balance: dbUser?.balance || 0 
      });
    }

    // Broadcast the result number globally so everyone spins
    if (this.io) {
      this.io.emit('roulette_spin', { resultNum });
      // Broadcast payouts with player names
      const userUpdates: Record<string, any> = {};
      for (const [userId, data] of resultsByUserId) {
        const info = this.playerInfo.get(userId);
        userUpdates[userId] = {
          ...data,
          name: info?.name || '???',
          avatar: info?.avatar || userId
        };
      }
      this.io.emit('roulette_results', { results: userUpdates });
    }
  }
}

export const rouletteEngine = new RouletteEngine();
