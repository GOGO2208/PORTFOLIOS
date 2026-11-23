#!/usr/bin/env perl
# Controlla che ogni strumento di elenco.tsv abbia un prezzo: segnala quelli non trovati stasera
# e quelli fermi da più di 6 giorni (weekend, festività di Borsa e ritardo di un giorno dei BTP). Exit 1 se c'è qualcosa (il job fallisce e GitHub manda l'email).
# Uso: OGGI=AAAA-MM-GG controlla.pl elenco.tsv giornalieri.csv mancanti.txt
use strict; use warnings; use Time::Local;
my ($elenco, $csv, $manca) = @ARGV;
my $oggi = $ENV{OGGI} or die "OGGI non impostato\n";
sub giorno { my ($a, $m, $g) = split /-/, shift; return timegm(0, 0, 12, $g, $m - 1, $a) / 86400 }
my %ultima;
open my $c, '<', $csv or die "$csv: $!\n";
while (<$c>) { chomp; my (undef, $df, $cod) = split /;/; next if !$cod || $cod eq 'codice';
  $ultima{$cod} = $df if !$ultima{$cod} || $df gt $ultima{$cod} }
my %stasera;
if (open my $m, '<', $manca) { while (<$m>) { chomp; $stasera{$_} = 1 if length } }
my @problemi;
open my $e, '<', $elenco or die "$elenco: $!\n";
while (<$e>) { chomp; my ($cod) = split /\t/; next if !$cod || $cod eq 'codice';
  if ($stasera{$cod}) { push @problemi, "$cod non trovato stasera" }
  if (!$ultima{$cod}) { push @problemi, "$cod senza nessun prezzo" }
  elsif (giorno($oggi) - giorno($ultima{$cod}) > 6) { push @problemi, "$cod fermo al $ultima{$cod}" } }
if (@problemi) { print "::error::Prezzi da controllare: $_\n" for @problemi; exit 1 }
print "tutti i prezzi ok\n";
