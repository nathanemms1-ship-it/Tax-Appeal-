// pages/florida/[city].js
// Dynamic neighborhood pages for Florida property tax appeals
// Creates 110 pages at /florida/[city-slug] e.g. /florida/miami-beach

import Head from 'next/head';
import Link from 'next/link';

const floridaCities = [
  { slug: "miami-beach", name: "Miami Beach", county: "Miami-Dade", medianHomeValue: 875000, avgSavings: 2400, description: "Miami Beach homeowners face some of Florida's highest assessed values, making property tax appeals especially valuable." },
  { slug: "coral-gables", name: "Coral Gables", county: "Miami-Dade", medianHomeValue: 1100000, avgSavings: 3100, description: "Coral Gables luxury homes are frequently over-assessed, making appeals one of the smartest financial moves homeowners can make." },
  { slug: "coconut-grove", name: "Coconut Grove", county: "Miami-Dade", medianHomeValue: 950000, avgSavings: 2700, description: "Coconut Grove's historic homes and waterfront properties are often valued inconsistently, creating strong grounds for appeal." },
  { slug: "brickell", name: "Brickell", county: "Miami-Dade", medianHomeValue: 620000, avgSavings: 1800, description: "Brickell condo owners frequently win property tax appeals due to market fluctuations in Miami's urban core." },
  { slug: "aventura", name: "Aventura", county: "Miami-Dade", medianHomeValue: 480000, avgSavings: 1400, description: "Aventura's high-rise condos and luxury homes are prime candidates for property tax appeals." },
  { slug: "doral", name: "Doral", county: "Miami-Dade", medianHomeValue: 520000, avgSavings: 1500, description: "Doral's rapidly growing real estate market means assessments often lag behind or overshoot actual market values." },
  { slug: "kendall", name: "Kendall", county: "Miami-Dade", medianHomeValue: 480000, avgSavings: 1300, description: "Kendall homeowners consistently find their assessments higher than comparable sales support." },
  { slug: "hialeah", name: "Hialeah", county: "Miami-Dade", medianHomeValue: 390000, avgSavings: 1100, description: "Hialeah's large homeowner population means millions in collective over-assessed property taxes every year." },
  { slug: "boca-raton", name: "Boca Raton", county: "Palm Beach", medianHomeValue: 680000, avgSavings: 1900, description: "Boca Raton's luxury market and gated communities make property tax appeals a financially savvy move for homeowners." },
  { slug: "fort-lauderdale", name: "Fort Lauderdale", county: "Broward", medianHomeValue: 520000, avgSavings: 1500, description: "Fort Lauderdale's waterfront and canal properties are frequently over-assessed relative to comparable sales." },
  { slug: "pompano-beach", name: "Pompano Beach", county: "Broward", medianHomeValue: 410000, avgSavings: 1200, description: "Pompano Beach homeowners have strong appeal success rates thanks to market inconsistencies in assessed values." },
  { slug: "hollywood-fl", name: "Hollywood", county: "Broward", medianHomeValue: 390000, avgSavings: 1100, description: "Hollywood Florida homeowners near the beach often see assessments that don't reflect actual market conditions." },
  { slug: "weston", name: "Weston", county: "Broward", medianHomeValue: 620000, avgSavings: 1800, description: "Weston's master-planned communities and high home values make property tax appeals especially rewarding." },
  { slug: "coral-springs", name: "Coral Springs", county: "Broward", medianHomeValue: 480000, avgSavings: 1400, description: "Coral Springs homeowners frequently succeed in appeals due to assessment inconsistencies across similar neighborhoods." },
  { slug: "pembroke-pines", name: "Pembroke Pines", county: "Broward", medianHomeValue: 430000, avgSavings: 1200, description: "Pembroke Pines is one of Broward's largest cities with thousands of homeowners who could benefit from an appeal." },
  { slug: "miramar", name: "Miramar", county: "Broward", medianHomeValue: 460000, avgSavings: 1300, description: "Miramar's fast-growing real estate market creates frequent assessment discrepancies worth challenging." },
  { slug: "west-palm-beach", name: "West Palm Beach", county: "Palm Beach", medianHomeValue: 430000, avgSavings: 1200, description: "West Palm Beach homeowners benefit from appeals especially in neighborhoods with mixed property types and values." },
  { slug: "boynton-beach", name: "Boynton Beach", county: "Palm Beach", medianHomeValue: 380000, avgSavings: 1100, description: "Boynton Beach's active 55+ community and family neighborhoods both see regular over-assessment issues." },
  { slug: "delray-beach", name: "Delray Beach", county: "Palm Beach", medianHomeValue: 520000, avgSavings: 1500, description: "Delray Beach's revitalized downtown and beach proximity drive high assessments that are frequently worth challenging." },
  { slug: "palm-beach-gardens", name: "Palm Beach Gardens", county: "Palm Beach", medianHomeValue: 620000, avgSavings: 1800, description: "Palm Beach Gardens luxury communities and golf course homes are regularly assessed above supportable market values." },
  { slug: "jupiter-fl", name: "Jupiter", county: "Palm Beach", medianHomeValue: 580000, avgSavings: 1700, description: "Jupiter's waterfront and equestrian properties often have assessments that don't match comparable sales evidence." },
  
  { slug: "brandon-fl", name: "Brandon", county: "Hillsborough", medianHomeValue: 360000, avgSavings: 1000, description: "Brandon's booming suburban growth means assessments often outpace what comparable homes are actually selling for." },
  { slug: "riverview-fl", name: "Riverview", county: "Hillsborough", medianHomeValue: 370000, avgSavings: 1050, description: "Riverview is one of Florida's fastest growing communities — rapid development creates assessment inconsistencies." },
  { slug: "wesley-chapel", name: "Wesley Chapel", county: "Pasco", medianHomeValue: 390000, avgSavings: 1100, description: "Wesley Chapel's new construction boom makes it especially important to verify your assessment against actual sales." },
  { slug: "temple-terrace", name: "Temple Terrace", county: "Hillsborough", medianHomeValue: 320000, avgSavings: 900, description: "Temple Terrace homeowners near the University of South Florida corridor often see inconsistent assessments." },
  { slug: "lutz-fl", name: "Lutz", county: "Hillsborough", medianHomeValue: 480000, avgSavings: 1400, description: "Lutz's upscale lakefront and acreage properties are frequently assessed without adequate comparable sales analysis." },
  { slug: "clearwater-fl", name: "Clearwater", county: "Pinellas", medianHomeValue: 380000, avgSavings: 1100, description: "Clearwater Beach and inland properties alike see appeal successes thanks to Florida's favorable VAB petition process." },
  { slug: "st-petersburg-fl", name: "St. Petersburg", county: "Pinellas", medianHomeValue: 360000, avgSavings: 1000, description: "St. Pete's rapidly gentrifying neighborhoods mean assessments are often based on outdated or inflated comps." },
  { slug: "largo-fl", name: "Largo", county: "Pinellas", medianHomeValue: 290000, avgSavings: 820, description: "Largo homeowners benefit from appeals particularly in neighborhoods transitioning between older and newer construction." },
  { slug: "dunedin-fl", name: "Dunedin", county: "Pinellas", medianHomeValue: 420000, avgSavings: 1200, description: "Dunedin's charming downtown and waterfront proximity drive high assessments that are often successfully appealed." },
  { slug: "tarpon-springs", name: "Tarpon Springs", county: "Pinellas", medianHomeValue: 350000, avgSavings: 990, description: "Tarpon Springs' unique historic character and sponge docks area create assessment challenges worth appealing." },
  { slug: "winter-park-fl", name: "Winter Park", county: "Orange", medianHomeValue: 680000, avgSavings: 1900, description: "Winter Park's luxury homes and historic estates are frequently over-assessed by Orange County appraisers." },
  { slug: "kissimmee-fl", name: "Kissimmee", county: "Osceola", medianHomeValue: 330000, avgSavings: 940, description: "Kissimmee's short-term rental market creates unique assessment challenges that homeowners can successfully appeal." },
  { slug: "oviedo-fl", name: "Oviedo", county: "Seminole", medianHomeValue: 430000, avgSavings: 1200, description: "Oviedo's highly desirable school district drives home prices that assessors don't always accurately reflect." },
  { slug: "lake-nona", name: "Lake Nona", county: "Orange", medianHomeValue: 520000, avgSavings: 1500, description: "Lake Nona's medical city and new construction boom create rapid assessment changes worth reviewing annually." },
  { slug: "apopka-fl", name: "Apopka", county: "Orange", medianHomeValue: 360000, avgSavings: 1020, description: "Apopka's suburban growth and new development create frequent assessment inconsistencies for homeowners to challenge." },
  { slug: "naples-fl", name: "Naples", county: "Collier", medianHomeValue: 890000, avgSavings: 2500, description: "Naples homeowners have some of Florida's highest savings potential — luxury properties are frequently over-assessed." },
  { slug: "marco-island", name: "Marco Island", county: "Collier", medianHomeValue: 980000, avgSavings: 2800, description: "Marco Island's waterfront and gulf access properties have among the highest appeal success rates in Florida." },
  { slug: "bonita-springs", name: "Bonita Springs", county: "Lee", medianHomeValue: 560000, avgSavings: 1600, description: "Bonita Springs luxury communities and golf course properties regularly see assessment reductions on appeal." },
  { slug: "fort-myers-fl", name: "Fort Myers", county: "Lee", medianHomeValue: 380000, avgSavings: 1080, description: "Fort Myers homeowners experienced significant post-hurricane assessment volatility, creating strong appeal opportunities." },
  { slug: "cape-coral", name: "Cape Coral", county: "Lee", medianHomeValue: 390000, avgSavings: 1100, description: "Cape Coral's massive canal system and waterfront market make property assessments especially difficult to get right." },
  { slug: "estero-fl", name: "Estero", county: "Lee", medianHomeValue: 480000, avgSavings: 1360, description: "Estero's upscale communities and golf course developments frequently see favorable results from VAB petitions." },
  { slug: "sarasota-fl", name: "Sarasota", county: "Sarasota", medianHomeValue: 510000, avgSavings: 1450, description: "Sarasota's arts district and beachfront properties are often assessed above what comparable sales actually support." },
  { slug: "venice-fl", name: "Venice", county: "Sarasota", medianHomeValue: 420000, avgSavings: 1200, description: "Venice homeowners near the island and beach areas consistently benefit from the Florida VAB appeal process." },
  { slug: "north-port-fl", name: "North Port", county: "Sarasota", medianHomeValue: 340000, avgSavings: 970, description: "North Port's rapid growth makes it one of Sarasota County's most active markets for successful property tax appeals." },
  { slug: "jacksonville-beach", name: "Jacksonville Beach", county: "Duval", medianHomeValue: 580000, avgSavings: 1650, description: "Jacksonville Beach oceanfront and near-beach properties are frequently assessed above actual market values." },
  { slug: "ponte-vedra-beach", name: "Ponte Vedra Beach", county: "St. Johns", medianHomeValue: 820000, avgSavings: 2300, description: "Ponte Vedra Beach luxury homes and golf communities have some of northeast Florida's highest appeal savings potential." },
  { slug: "fleming-island", name: "Fleming Island", county: "Clay", medianHomeValue: 380000, avgSavings: 1080, description: "Fleming Island homeowners in Clay County's fastest growing area often find their assessments outpacing market data." },
  { slug: "daytona-beach", name: "Daytona Beach", county: "Volusia", medianHomeValue: 290000, avgSavings: 820, description: "Daytona Beach homeowners near the speedway and ocean find significant value in the VAB appeal process." },
  { slug: "new-smyrna-beach", name: "New Smyrna Beach", county: "Volusia", medianHomeValue: 480000, avgSavings: 1360, description: "New Smyrna Beach's surf town charm drives high demand and frequent over-assessment of beachside properties." },
  // ── BATCH 2 ───────────────────────────────────────────────────────────────
  
  
  { slug: "cooper-city-fl", name: "Cooper City", county: "Broward", medianHomeValue: 540000, avgSavings: 1550, description: "Cooper City is consistently ranked among Broward's most desirable suburbs, and high demand drives assessments above true market value. Our flat fee appeal process gives homeowners a clear path to savings." },
  
  { slug: "deerfield-beach", name: "Deerfield Beach", county: "Broward", medianHomeValue: 390000, avgSavings: 1100, description: "Deerfield Beach homeowners benefit from strong appeal success rates in Broward County. Coastal and inland properties alike frequently carry assessments that exceed what comparable sales support." },
  { slug: "lighthouse-point", name: "Lighthouse Point", county: "Broward", medianHomeValue: 780000, avgSavings: 2200, description: "Lighthouse Point's waterfront homes and boating community command premium prices that assessors frequently overestimate. Our tracked mail filing, sent 7+ days early, ensures your VAB petition is received by the deadline." },
  { slug: "sunny-isles-beach", name: "Sunny Isles Beach", county: "Miami-Dade", medianHomeValue: 950000, avgSavings: 2700, description: "Sunny Isles Beach's luxury high-rises are among Miami-Dade's most frequently over-assessed properties. Condo market fluctuations create significant opportunities for successful tax appeals." },
  { slug: "hallandale-beach", name: "Hallandale Beach", county: "Broward", medianHomeValue: 420000, avgSavings: 1200, description: "Hallandale Beach homeowners on the Miami-Dade border benefit from formal appeals as rapidly changing market conditions create assessment discrepancies throughout this coastal community." },
  { slug: "surfside-fl", name: "Surfside", county: "Miami-Dade", medianHomeValue: 1200000, avgSavings: 3400, description: "Surfside's exclusive beachfront community carries some of Miami-Dade's highest assessed values. Even modest percentage reductions through a VAB appeal can yield thousands in annual tax savings." },
  { slug: "bal-harbour", name: "Bal Harbour", county: "Miami-Dade", medianHomeValue: 1500000, avgSavings: 4200, description: "Bal Harbour's ultra-luxury properties and world-class shopping district create unique valuation challenges. Over-assessments here represent some of the largest savings opportunities in all of Florida." },
  { slug: "key-biscayne", name: "Key Biscayne", county: "Miami-Dade", medianHomeValue: 1400000, avgSavings: 3900, description: "Key Biscayne's island exclusivity and limited comparable sales create frequent over-assessment situations. Our flat $89 fee is a minimal investment compared to the annual savings a successful appeal delivers." },
  
  { slug: "homestead-fl", name: "Homestead", county: "Miami-Dade", medianHomeValue: 350000, avgSavings: 1000, description: "Homestead homeowners in Miami-Dade's southern communities benefit from formal VAB petitions as rapid growth has created assessment inconsistencies across this expanding market." },
  { slug: "westchase-fl", name: "Westchase", county: "Hillsborough", medianHomeValue: 580000, avgSavings: 1650, description: "Westchase is one of Tampa's most desirable master-planned communities, and high demand drives assessments that frequently exceed true market value. Our streamlined filing process makes appealing straightforward." },
  { slug: "south-tampa-fl", name: "South Tampa", county: "Hillsborough", medianHomeValue: 720000, avgSavings: 2050, description: "South Tampa's Bayshore Boulevard corridor and historic neighborhoods carry premium assessments that often outpace comparable sales. With median values over $700K, every percentage point of reduction matters." },
  { slug: "carrollwood-fl", name: "Carrollwood", county: "Hillsborough", medianHomeValue: 400000, avgSavings: 1150, description: "Carrollwood's established suburban neighborhoods and lakefront homes frequently carry over-assessments in Hillsborough County. Our tracked mail filing, sent 7+ days early, ensures your protest reaches the VAB on time." },
  { slug: "siesta-key-fl", name: "Siesta Key", county: "Sarasota", medianHomeValue: 1150000, avgSavings: 3300, description: "Siesta Key's award-winning beaches and luxury homes create significant valuation challenges. Over-assessments on this barrier island are common, and successful appeals regularly save homeowners thousands annually." },
  { slug: "lakewood-ranch-fl", name: "Lakewood Ranch", county: "Manatee", medianHomeValue: 560000, avgSavings: 1600, description: "Lakewood Ranch is one of the nation's fastest-growing master-planned communities. Rapid new construction creates comparable sales gaps that lead to frequent over-assessments worth appealing." },
  { slug: "bradenton-fl", name: "Bradenton", county: "Manatee", medianHomeValue: 380000, avgSavings: 1100, description: "Bradenton homeowners across Manatee County benefit from formal VAB appeals as waterfront and suburban properties alike are frequently assessed above what comparable sales support." },
  { slug: "port-st-lucie-fl", name: "Port St. Lucie", county: "St. Lucie", medianHomeValue: 370000, avgSavings: 1050, description: "Port St. Lucie is one of Florida's fastest-growing cities, and rapid expansion creates consistent assessment discrepancies. Our flat fee appeal process is perfect for this high-volume, high-opportunity market." },
  { slug: "vero-beach-fl", name: "Vero Beach", county: "Indian River", medianHomeValue: 450000, avgSavings: 1300, description: "Vero Beach's upscale coastal community and golf course neighborhoods frequently carry over-assessments. Indian River County homeowners benefit from formal VAB petitions that target these discrepancies." },
  { slug: "lakeland-fl", name: "Lakeland", county: "Polk", medianHomeValue: 310000, avgSavings: 900, description: "Lakeland homeowners between Tampa and Orlando benefit from formal VAB appeals as this growing market experiences frequent assessment inconsistencies. Our flat $89 fee makes protesting accessible for every homeowner." },
  { slug: "doctor-phillips-fl", name: "Doctor Phillips", county: "Orange", medianHomeValue: 680000, avgSavings: 1900, description: "Doctor Phillips homeowners near the Restaurant Row corridor and luxury golf communities frequently find their assessments exceed comparable sale prices, making formal appeals an excellent financial decision." },
  { slug: "windermere-fl", name: "Windermere", county: "Orange", medianHomeValue: 1100000, avgSavings: 3100, description: "Windermere's lakefront estates and gated communities are prime candidates for property tax appeals. With limited comparable sales and unique waterfront features, assessors frequently miss the mark on true market value." },
  { slug: "hunters-creek-fl", name: "Hunters Creek", county: "Orange", medianHomeValue: 420000, avgSavings: 1200, description: "Hunters Creek's large planned community with thousands of homes sees consistent over-assessment patterns. Our flat $89 fee makes formal VAB filing affordable for every homeowner in this Orange County community." },
  { slug: "new-tampa-fl", name: "New Tampa", county: "Hillsborough", medianHomeValue: 450000, avgSavings: 1300, description: "New Tampa's large planned communities and consistent housing stock create both the need and the evidence for successful property tax appeals. Our flat fee service handles all filing formalities." },
  { slug: "longboat-key-fl", name: "Longboat Key", county: "Sarasota", medianHomeValue: 1200000, avgSavings: 3400, description: "Longboat Key's ultra-luxury barrier island homes are among Sarasota County's most frequently over-assessed. Gulf-front estates here regularly see six-figure assessment reductions through formal VAB appeals." },
  { slug: "golden-gate-fl", name: "Golden Gate", county: "Collier", medianHomeValue: 380000, avgSavings: 1100, description: "Golden Gate homeowners in the Naples area benefit from formal VAB appeals as Collier County's growing market creates assessment inconsistencies across this large suburban community." },
  { slug: "melbourne-fl", name: "Melbourne", county: "Brevard", medianHomeValue: 320000, avgSavings: 900, description: "Melbourne homeowners on the Space Coast benefit from formal property tax appeals as the tech and aerospace boom drives assessments that frequently outpace comparable sales." },
  // ── BATCH 3 ───────────────────────────────────────────────────────────────
  { slug: "destin-fl", name: "Destin", county: "Okaloosa", medianHomeValue: 720000, avgSavings: 2050, description: "Destin's Emerald Coast beach homes and vacation properties are among Florida's most frequently over-assessed. With luxury condos and waterfront estates commanding premium prices, a formal VAB appeal can deliver substantial annual savings." },
  { slug: "30a-fl", name: "30A", county: "Walton", medianHomeValue: 1300000, avgSavings: 3700, description: "30A's iconic beach communities — Seaside, Rosemary Beach, Alys Beach — carry some of Florida's highest property assessments. Over-assessments here represent exceptional VAB appeal opportunities with savings often exceeding the statewide average." },
  { slug: "fort-walton-beach", name: "Fort Walton Beach", county: "Okaloosa", medianHomeValue: 380000, avgSavings: 1100, description: "Fort Walton Beach homeowners on the Emerald Coast benefit from formal VAB appeals as military-driven demand creates assessment volatility across this Okaloosa County community." },
  { slug: "niceville-fl", name: "Niceville", county: "Okaloosa", medianHomeValue: 420000, avgSavings: 1200, description: "Niceville's highly desirable school district and Eglin AFB proximity drive home prices that Okaloosa County assessors frequently overestimate. Formal VAB appeals here have a strong success track record." },
  { slug: "pensacola-beach", name: "Pensacola Beach", county: "Escambia", medianHomeValue: 680000, avgSavings: 1950, description: "Pensacola Beach's gulf-front and bay-front homes are among Northwest Florida's most frequently over-assessed properties. A formal VAB petition is one of the smartest financial moves a beach homeowner can make." },
  { slug: "panama-city-beach", name: "Panama City Beach", county: "Bay", medianHomeValue: 520000, avgSavings: 1500, description: "Panama City Beach vacation homes and investment condos are frequently assessed above true market value. Bay County's active real estate market creates consistent over-assessment patterns worth appealing every year." },
  { slug: "navarre-fl", name: "Navarre", county: "Santa Rosa", medianHomeValue: 380000, avgSavings: 1100, description: "Navarre homeowners in Santa Rosa County benefit from formal VAB appeals as this fast-growing Panhandle community sees assessment inconsistencies driven by rapid new development." },
  { slug: "nocatee-fl", name: "Nocatee", county: "St. Johns", medianHomeValue: 580000, avgSavings: 1650, description: "Nocatee is one of the nation's top-selling master-planned communities and St. Johns County's fastest-growing area. New construction assessments here frequently exceed what comparable sales actually support." },
  { slug: "st-johns-fl", name: "St. Johns", county: "St. Johns", medianHomeValue: 520000, avgSavings: 1500, description: "St. Johns County homeowners consistently rank among Florida's highest earners, and their property assessments often reflect inflated values. A formal VAB petition regularly achieves meaningful reductions here." },
  { slug: "orange-park-fl", name: "Orange Park", county: "Clay", medianHomeValue: 310000, avgSavings: 890, description: "Orange Park homeowners in Clay County benefit from formal VAB appeals as Jacksonville's suburban expansion pushes assessments above what comparable sales in this community actually support." },
  { slug: "fernandina-beach", name: "Fernandina Beach", county: "Nassau", medianHomeValue: 560000, avgSavings: 1600, description: "Fernandina Beach on Amelia Island carries some of Northeast Florida's highest home values, and Nassau County assessments frequently exceed what the market will actually bear. VAB appeals here deliver strong results." },
  { slug: "amelia-island-fl", name: "Amelia Island", county: "Nassau", medianHomeValue: 780000, avgSavings: 2200, description: "Amelia Island's luxury resort community and oceanfront estates are prime candidates for VAB appeals. With home values regularly exceeding $1M, even a small assessment reduction translates to thousands in annual savings." },
  { slug: "celebration-fl", name: "Celebration", county: "Osceola", medianHomeValue: 490000, avgSavings: 1400, description: "Celebration's Disney-developed community carries premium assessed values that often exceed what comparable Osceola County sales support. Our tracked VAB mail filing process makes appealing straightforward for every homeowner." },
  { slug: "altamonte-springs", name: "Altamonte Springs", county: "Seminole", medianHomeValue: 330000, avgSavings: 940, description: "Altamonte Springs homeowners in Seminole County find frequent over-assessment opportunities as this established Orlando suburb sees rising demand that assessors often overshoot." },
  { slug: "lake-mary-fl", name: "Lake Mary", county: "Seminole", medianHomeValue: 480000, avgSavings: 1380, description: "Lake Mary's upscale tech-corridor communities and master-planned neighborhoods are frequently over-assessed by Seminole County. A formal VAB appeal is one of the highest-ROI financial moves available to homeowners here." },
  { slug: "sanford-fl", name: "Sanford", county: "Seminole", medianHomeValue: 330000, avgSavings: 950, description: "Sanford homeowners on Lake Monroe and in the historic district benefit from VAB appeals as Seminole County's growing market creates assessment inconsistencies across diverse property types." },
  { slug: "longwood-fl", name: "Longwood", county: "Seminole", medianHomeValue: 370000, avgSavings: 1060, description: "Longwood's established Seminole County neighborhoods see consistent over-assessment patterns as the broader Orlando market pushes values that don't always reflect individual property conditions." },
  { slug: "clermont-fl", name: "Clermont", county: "Lake", medianHomeValue: 390000, avgSavings: 1120, description: "Clermont's rolling hills and lakefront communities are among Central Florida's fastest-growing, and Lake County assessments frequently lag behind or overshoot actual market values. VAB appeals here succeed regularly." },
  { slug: "minneola-fl", name: "Minneola", county: "Lake", medianHomeValue: 380000, avgSavings: 1090, description: "Minneola homeowners in Lake County benefit from formal VAB petitions as rapid new development creates frequent gaps between assessed values and what comparable homes are actually selling for." },
  { slug: "the-villages-fl", name: "The Villages", county: "Sumter", medianHomeValue: 340000, avgSavings: 970, description: "The Villages is one of America's largest retirement communities, and Sumter County assessments here frequently exceed what the active resale market supports. Our flat $89 fee makes appealing accessible for every Villages homeowner." },
  { slug: "ocala-fl", name: "Ocala", county: "Marion", medianHomeValue: 270000, avgSavings: 780, description: "Ocala's horse country estates and suburban communities both see frequent over-assessments as Marion County's market grows rapidly. A formal VAB appeal is a smart move for equestrian property owners and suburban homeowners alike." },
  { slug: "gainesville-fl", name: "Gainesville", county: "Alachua", medianHomeValue: 290000, avgSavings: 830, description: "Gainesville homeowners near the University of Florida benefit from formal VAB appeals as Alachua County assessments often reflect the student-driven rental market rather than owner-occupied home values." },
  { slug: "viera-fl", name: "Viera", county: "Brevard", medianHomeValue: 440000, avgSavings: 1260, description: "Viera's master-planned community on the Space Coast sees frequent assessment discrepancies as new construction outpaces comparable sale data. Brevard County homeowners here consistently find grounds for successful appeals." },
  { slug: "rockledge-fl", name: "Rockledge", county: "Brevard", medianHomeValue: 350000, avgSavings: 1000, description: "Rockledge homeowners near the Kennedy Space Center corridor benefit from formal VAB petitions as tech and aerospace sector growth drives assessments above what the broader Brevard market supports." },
  { slug: "palm-bay-fl", name: "Palm Bay", county: "Brevard", medianHomeValue: 310000, avgSavings: 890, description: "Palm Bay is Brevard County's largest city by population, and its rapid growth creates consistent assessment inconsistencies. Our flat $89 fee makes formal VAB filing accessible for every Palm Bay homeowner." },
  { slug: "stuart-fl", name: "Stuart", county: "Martin", medianHomeValue: 490000, avgSavings: 1400, description: "Stuart's Treasure Coast location and waterfront communities carry Martin County assessments that frequently exceed true market value. Homeowners here benefit from formal VAB petitions that target these specific discrepancies." },
  { slug: "jensen-beach-fl", name: "Jensen Beach", county: "Martin", medianHomeValue: 460000, avgSavings: 1320, description: "Jensen Beach homeowners on the Treasure Coast benefit from formal appeals as Martin County's waterfront and golf community properties are frequently assessed above comparable sales evidence." },
  { slug: "tradition-fl", name: "Tradition", county: "St. Lucie", medianHomeValue: 380000, avgSavings: 1090, description: "Tradition is one of Florida's most award-winning master-planned communities, and St. Lucie County assessments here frequently outpace what comparable sales actually support. VAB petitions deliver consistent results." },
  { slug: "palm-beach-fl", name: "Palm Beach", county: "Palm Beach", medianHomeValue: 2800000, avgSavings: 7900, description: "Palm Beach's ultra-luxury island estates represent some of the most valuable — and most frequently over-assessed — properties in all of Florida. Even a fraction of a percent reduction on a $3M+ home saves tens of thousands annually." },
  { slug: "north-miami-beach", name: "North Miami Beach", county: "Miami-Dade", medianHomeValue: 420000, avgSavings: 1200, description: "North Miami Beach homeowners benefit from formal VAB appeals as Miami-Dade's rapidly evolving coastal market creates consistent assessment discrepancies across this diverse community." },
  { slug: "plantation", name: "Plantation", county: "Broward", medianHomeValue: 510000, avgSavings: 1500, description: "Plantation homeowners regularly find their assessments outpacing comparable sales in this established Broward suburb, making VAB petitions a high-value move before the TRIM deadline." },
  { slug: "davie", name: "Davie", county: "Broward", medianHomeValue: 540000, avgSavings: 1600, description: "Davie's mix of equestrian estates, family homes, and college-adjacent properties creates wide assessment variation that formal VAB petitions consistently correct." },
  { slug: "sunrise", name: "Sunrise", county: "Broward", medianHomeValue: 430000, avgSavings: 1250, description: "Sunrise homeowners benefit from strong VAB petition success rates as Broward County's mass appraisal model frequently over-estimates values in this diverse, growing community." },
  
  
  { slug: "tamarac", name: "Tamarac", county: "Broward", medianHomeValue: 360000, avgSavings: 1050, description: "Tamarac homeowners — many in active adult communities — frequently succeed with VAB petitions as Broward's assessment model misses the nuances of this community's market." },
  { slug: "margate", name: "Margate", county: "Broward", medianHomeValue: 370000, avgSavings: 1075, description: "Margate's affordable Broward market has seen significant post-pandemic appreciation that mass appraisal models are slow to correctly capture at the individual property level." },
  { slug: "coconut-creek", name: "Coconut Creek", county: "Broward", medianHomeValue: 395000, avgSavings: 1150, description: "Coconut Creek homeowners in both traditional neighborhoods and Wynmoor Village's active adult community benefit from targeted VAB petitions backed by local comparable sales." },
  { slug: "parkland", name: "Parkland", county: "Broward", medianHomeValue: 780000, avgSavings: 2250, description: "Parkland's premier status as one of South Florida's most desirable cities means high assessed values — and a high dollar return when comparable sales support a successful appeal." },
  { slug: "lauderhill", name: "Lauderhill", county: "Broward", medianHomeValue: 330000, avgSavings: 950, description: "Lauderhill homeowners find strong grounds for VAB petitions as Broward's appraisal model frequently overstates values relative to arm's-length sales in this community." },
  { slug: "north-lauderdale", name: "North Lauderdale", county: "Broward", medianHomeValue: 310000, avgSavings: 900, description: "North Lauderdale's affordably-priced market has seen rapid appreciation — and assessment corrections that lag the actual market, creating appeal opportunities for careful homeowners." },
  
  { slug: "lake-worth-beach", name: "Lake Worth Beach", county: "Palm Beach", medianHomeValue: 380000, avgSavings: 1100, description: "Lake Worth Beach's diverse coastal market — from historic bungalows to newer townhomes — sees wide individual variation in assessments that formal petitions routinely correct." },
  { slug: "greenacres", name: "Greenacres", county: "Palm Beach", medianHomeValue: 360000, avgSavings: 1050, description: "Greenacres homeowners benefit from Palm Beach County VAB petitions as the county's mass appraisal model frequently misses neighborhood-level pricing nuances in this community." },
  { slug: "royal-palm-beach", name: "Royal Palm Beach", county: "Palm Beach", medianHomeValue: 440000, avgSavings: 1275, description: "Royal Palm Beach's family-oriented communities have seen strong appreciation — and Palm Beach County assessments that regularly outpace what comparable sales support." },
  { slug: "loxahatchee", name: "Loxahatchee", county: "Palm Beach", medianHomeValue: 490000, avgSavings: 1400, description: "Loxahatchee's acreage communities and equestrian properties present unique comparable-sale challenges that mass appraisal handles poorly, creating strong VAB petition opportunities." },
  { slug: "riviera-beach", name: "Riviera Beach", county: "Palm Beach", medianHomeValue: 350000, avgSavings: 1000, description: "Riviera Beach homeowners benefit from VAB petitions as Palm Beach County's assessment model frequently overstates values in this waterfront-adjacent community." },
  { slug: "belle-glade", name: "Belle Glade", county: "Palm Beach", medianHomeValue: 195000, avgSavings: 560, description: "Belle Glade homeowners in Palm Beach County's agricultural heartland find consistent grounds for VAB petitions where rural comparable sales diverge sharply from mass appraisal estimates." },
  { slug: "wellington", name: "Wellington", county: "Palm Beach", medianHomeValue: 560000, avgSavings: 1625, description: "Wellington's equestrian estates and upscale planned communities are regularly over-assessed — thin comparable sales at premium price points make formal VAB petitions especially effective here." },
  { slug: "hialeah-gardens", name: "Hialeah Gardens", county: "Miami-Dade", medianHomeValue: 410000, avgSavings: 1175, description: "Hialeah Gardens homeowners consistently find over-assessments relative to comparable sales in this tight-knit Miami-Dade community, where a formal VAB petition can quickly correct the discrepancy." },
  { slug: "miami-lakes", name: "Miami Lakes", county: "Miami-Dade", medianHomeValue: 480000, avgSavings: 1375, description: "Miami Lakes' planned community of single-family homes and townhomes sees regular assessment over-shoots that VAB petitions backed by strong comparable sales evidence readily resolve." },
  { slug: "miami-springs", name: "Miami Springs", county: "Miami-Dade", medianHomeValue: 430000, avgSavings: 1225, description: "Miami Springs' historic neighborhoods near Miami International Airport have unique value dynamics that Miami-Dade's mass appraisal model misses, creating recurring appeal opportunities." },
  { slug: "opa-locka", name: "Opa-locka", county: "Miami-Dade", medianHomeValue: 270000, avgSavings: 775, description: "Opa-locka homeowners benefit from VAB petitions as Miami-Dade's mass appraisal model regularly over-estimates values in this community relative to local arm's-length sales." },
  { slug: "sweetwater", name: "Sweetwater", county: "Miami-Dade", medianHomeValue: 390000, avgSavings: 1125, description: "Sweetwater homeowners near Florida International University benefit from targeted VAB petitions separating owner-occupant comparable sales from investment and student-housing purchases." },
  { slug: "cutler-bay", name: "Cutler Bay", county: "Miami-Dade", medianHomeValue: 450000, avgSavings: 1300, description: "Cutler Bay's planned residential communities in south Miami-Dade have seen strong appreciation — and VAB petitions that routinely achieve reductions when comparable sales support a lower value." },
  
  { slug: "florida-city", name: "Florida City", county: "Miami-Dade", medianHomeValue: 290000, avgSavings: 830, description: "Florida City homeowners at the gateway to the Everglades have strong grounds for VAB petitions where rural-adjacent market dynamics diverge from Miami-Dade's urban assessment model." },
  { slug: "palmetto-bay", name: "Palmetto Bay", county: "Miami-Dade", medianHomeValue: 680000, avgSavings: 1975, description: "Palmetto Bay's upscale south Miami-Dade village — one of the county's most desirable residential communities — sees consistent over-assessments at premium price points where comparable sales are limited." },
  { slug: "pinecrest", name: "Pinecrest", county: "Miami-Dade", medianHomeValue: 1150000, avgSavings: 3350, description: "Pinecrest's luxury single-family estates command some of Miami-Dade's highest values — and with thin comparable sales at $1M+, formal VAB petitions regularly achieve significant reductions." },
  { slug: "west-kendall", name: "West Kendall", county: "Miami-Dade", medianHomeValue: 510000, avgSavings: 1475, description: "West Kendall's large suburban communities in western Miami-Dade present strong VAB petition opportunities as rapid post-pandemic appreciation has outpaced accurate mass appraisal corrections." }
];

export async function getStaticPaths() {
  const paths = floridaCities.map((city) => ({
    params: { city: city.slug },
  }));
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const city = floridaCities.find((c) => c.slug === params.city);
  if (!city) return { notFound: true };
  return { props: { city } };
}

export default function FloridaCityPage({ city }) {
  const formattedValue = city.medianHomeValue.toLocaleString();
  const formattedSavings = city.avgSavings.toLocaleString();
  const trimDeadline = "September 18, 2026";
  const trimOpen = "August 15, 2026";

  const faqs = [
    {
      q: `How do I appeal my property tax in ${city.name}, Florida?`,
      a: `When you receive your TRIM notice in August, you have 25 days to file a petition with the ${city.county} County Value Adjustment Board (VAB). TaxAppeal USA handles the entire process for you — we generate a professional protest letter with comparable sales evidence and mail it 7+ days before your deadline, all for a flat $89 fee.`,
    },
    {
      q: `When is the property tax appeal deadline in ${city.name}?`,
      a: `Florida TRIM notices are mailed in mid-August each year. The VAB petition deadline is 25 days after your notice is mailed, typically falling around September 18. You must file before this date — TaxAppeal USA prepares your petition and mails it certified once you sign, with time to spare.`,
    },
    {
      q: `How much can I save on property taxes in ${city.name}?`,
      a: `${city.name} homeowners with a median home value of $${formattedValue} save an average of $${formattedSavings} per year when their appeal is successful. At a flat $89 fee, TaxAppeal USA pays for itself many times over.`,
    },
    {
      q: `What is a TRIM notice in Florida?`,
      a: `TRIM stands for Truth in Millage. It is a notice mailed by your county property appraiser every August showing your proposed property assessment and estimated taxes. If you believe your assessed value is too high, you have 25 days to file a petition with the Value Adjustment Board.`,
    },
    {
      q: `Do I need an attorney to appeal my ${city.name} property taxes?`,
      a: `No attorney is required. Florida law allows homeowners to file VAB petitions themselves. TaxAppeal USA prepares a professional, evidence-backed petition letter and mails it 7+ days before your deadline for just $89 — no attorney fees, no percentage of savings.`,
    },
    {
      q: `Why choose TaxAppeal USA over other services in ${city.name}?`,
      a: `Every competitor charges 25-50% of your savings — this costs homeowners heavily. TaxAppeal USA charges a flat $89 regardless of how much you save. You keep more of what you earn.`,
    },
  ];

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => {
      return {
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      };
    }),
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "TaxAppeal USA",
    description: `Property tax appeal service for ${city.name}, Florida homeowners`,
    url: `https://www.taxappealusa.com/florida/${city.slug}`,
    areaServed: { "@type": "City", name: city.name },
    priceRange: "$89 flat fee",
    telephone: "+18175644050",
  };

  return (
    <>
      <Head>
        <title>{city.name} Property Tax Appeal | $89 Flat Fee | TaxAppeal USA</title>
        <meta name="description" content={`Appeal your ${city.name} property tax bill for just $89 flat. ${city.county} County homeowners save an average of $${formattedSavings}/year. We mail your VAB petition 7+ days before your deadline. No percentage fees ever.`} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`https://www.taxappealusa.com/florida/${city.slug}`} />
        <meta property="og:title" content={`${city.name} Property Tax Appeal | $89 Flat | TaxAppeal USA`} />
        <meta property="og:description" content={`Save an average of $${formattedSavings} on your ${city.name} property taxes. Flat $89 fee - no percentages. We handle the paperwork.`} />
        <meta property="og:url" content={`https://www.taxappealusa.com/florida/${city.slug}`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
      </Head>

      {(() => {
        const preOrderOpen = new Date('2026-06-12');
        const windowOpen = new Date('2026-08-11');
        const windowClose = new Date('2026-09-18');
        const today = new Date();
        const barStyle = { background: '#FFC940', color: '#0F1F3D', textAlign: 'center', padding: '10px 16px', fontSize: 14, fontWeight: 600 };
        if (today >= preOrderOpen && today < windowOpen) {
          const days = Math.ceil((windowOpen - today) / (1000*60*60*24));
          return (
            <div style={barStyle}>
              🔒 Reserve your {city.county} County spot now — TRIM notices start arriving in {days} days. Lock in the $89 rate today; we file the moment your county's window opens. <a href="/apply" style={{ color: '#0F1F3D', textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
            </div>
          );
        }
        if (today >= windowOpen && today <= windowClose) {
          return (
            <div style={barStyle}>
              🚨 Florida's filing window is open — file before your county's 25-day deadline. <a href="/apply" style={{ color: '#0F1F3D', textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
            </div>
          );
        }
        return null;
      })()}


      <div style={{ fontFamily: "'DM Sans',sans-serif", color: "#1B2A4A", maxWidth: "1100px", margin: "0 auto", padding: "0 24px" }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: "1px solid #e5e7eb" }}>
          <Link href="/" style={{ textDecoration: "none" }}><span style={{ fontSize: "22px", fontWeight: "800", color: "#1B2A4A" }}>TaxAppeal <span style={{ color: "#C9A84C" }}>USA</span></span></Link>
          <Link href="/apply"><button style={{ background: "#C9A84C", color: "#1B2A4A", border: "none", borderRadius: "8px", padding: "12px 28px", fontWeight: "700", fontSize: "15px", cursor: "pointer" }}>Start My Appeal — $89</button></Link>
        </nav>

        <section style={{ padding: "60px 0 40px", textAlign: "center" }}>
          <div style={{ background: "#1B2A4A", color: "#C9A84C", display: "inline-block", padding: "6px 18px", borderRadius: "20px", fontSize: "13px", fontWeight: "700", marginBottom: "20px" }}>FLORIDA {city.county.toUpperCase()} COUNTY · VAB PETITION</div>
          <h1 style={{ fontSize: "clamp(32px,5vw,54px)", fontWeight: "800", lineHeight: "1.15", marginBottom: "20px", color: "#1B2A4A" }}>{city.name} Property Tax Appeal</h1>
          <p style={{ fontSize: "20px", color: "#4b5563", maxWidth: "680px", margin: "0 auto 32px", lineHeight: "1.6" }}>{city.description} Save an average of <strong style={{ color: "#1B2A4A" }}>${formattedSavings}</strong> per year for just <strong style={{ color: "#C9A84C" }}>$89 flat</strong>.</p>
          <Link href="/apply"><button style={{ background: "#C9A84C", color: "#1B2A4A", border: "none", borderRadius: "10px", padding: "16px 40px", fontWeight: "800", fontSize: "18px", cursor: "pointer", marginBottom: "40px" }}>Appeal My {city.name} Taxes</button></Link>
        </section>

        <div style={{ background: "#1B2A4A", color: "white", borderRadius: "12px", padding: "20px 32px", textAlign: "center", margin: "0 32px 48px" }}>
          <span style={{ fontSize: "16px", fontWeight: "600" }}>Florida TRIM notices mail around <strong style={{ color: "#C9A84C" }}>{trimOpen}</strong> — you have 25 days to file. <strong style={{ color: "#C9A84C" }}>Do not miss your window.</strong></span>
        </div>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "32px", fontWeight: "800", textAlign: "center", marginBottom: "40px" }}>How It Works for {city.name} Homeowners</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "24px" }}>
            {[
              { step: "1", title: "Enter Your Address", desc: `We instantly pull your ${city.county} County assessment data.` },
              { step: "2", title: "We Build Your Case", desc: "Our system generates a professional VAB petition with real comparable sales evidence." },
              { step: "3", title: "Mailed Early, Tracked", desc: `Your petition is sent to the ${city.county} County VAB via USPS mail with tracking, 7+ days before your deadline.` },
              { step: "4", title: "Track Your Outcome", desc: "We notify you when the county responds. Most results in 60-90 days." },
            ].map((s) => (
              <div key={s.step} style={{ background: "#f8f9fa", borderRadius: "12px", padding: "28px 24px", textAlign: "center" }}>
                <div style={{ width: "44px", height: "44px", background: "#1B2A4A", color: "#C9A84C", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "18px", margin: "0 auto 16px" }}>{s.step}</div>
                <h3 style={{ fontSize: "17px", fontWeight: "700", marginBottom: "10px" }}>{s.title}</h3>
                <p style={{ fontSize: "14px", color: "#6b7280", lineHeight: "1.6" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "32px", fontWeight: "800", textAlign: "center", marginBottom: "12px" }}>$89 Flat vs. The Competition</h2>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: "17px", marginBottom: "36px" }}>Every other {city.name} property tax service charges a percentage of your savings.</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
            <thead><tr style={{ background: "#1B2A4A", color: "white" }}><th style={{ padding: "14px 20px", textAlign: "left" }}>Service</th><th style={{ padding: "14px 20px", textAlign: "center" }}>Fee Structure</th><th style={{ padding: "14px 20px", textAlign: "center" }}>Cost on ${formattedSavings} Win</th></tr></thead>
            <tbody>
              <tr style={{ background: "#C9A84C20", fontWeight: "700" }}><td style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>TaxAppeal USA</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>$89 flat fee</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#16a34a" }}>$89</td></tr>
              <tr><td style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>Ownwell</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>25-35% of savings</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#dc2626" }}>${Math.round(city.avgSavings * 0.30).toLocaleString()}</td></tr>
              <tr style={{ background: "#f9fafb" }}><td style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>O&apos;Connor/CutMyTaxes</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>30-50% of savings</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#dc2626" }}>${Math.round(city.avgSavings * 0.40).toLocaleString()}</td></tr>
              <tr><td style={{ padding: "14px 20px" }}>Local Tax Attorney</td><td style={{ padding: "14px 20px", textAlign: "center" }}>$300-$800+</td><td style={{ padding: "14px 20px", textAlign: "center", color: "#dc2626" }}>$500+</td></tr>
            </tbody>
          </table>
        </section>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "28px", fontWeight: "800", marginBottom: "20px" }}>Florida Property Tax Appeal Law</h2>
          <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "28px 32px" }}>
            <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#374151", marginBottom: "16px" }}>Under <strong>Florida Statute §194.011</strong>, every homeowner has the right to petition the VAB to challenge their property assessment. No attorney required.</p>
            <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#374151", marginBottom: "16px" }}>You have exactly <strong>25 days</strong> from your TRIM notice mailing date to file your VAB petition.</p>
            <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#374151" }}>TaxAppeal USA prepares your petition and sends it to the {city.county} County VAB via USPS mail, 7+ days before your deadline, so you have proof of timely filing.</p>
          </div>
        </section>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "32px", fontWeight: "800", textAlign: "center", marginBottom: "36px" }}>FAQs — {city.name}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ background: "#f8f9fa", borderRadius: "12px", padding: "24px 28px" }}>
                <h3 style={{ fontSize: "17px", fontWeight: "700", marginBottom: "10px", color: "#1B2A4A" }}>{faq.q}</h3>
                <p style={{ fontSize: "15px", color: "#4b5563", lineHeight: "1.7", margin: 0 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "60px 0", textAlign: "center", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "36px", fontWeight: "800", marginBottom: "16px" }}>Ready to Appeal Your {city.name} Property Taxes?</h2>
          <p style={{ fontSize: "18px", color: "#6b7280", maxWidth: "560px", margin: "0 auto 32px" }}>Join thousands of Florida homeowners saving an average of ${formattedSavings}/year. Just $89 flat.</p>
          <Link href="/apply"><button style={{ background: "#C9A84C", color: "#1B2A4A", border: "none", borderRadius: "10px", padding: "18px 48px", fontWeight: "800", fontSize: "20px", cursor: "pointer" }}>Start My Appeal — $89 Flat</button></Link>
          <p style={{ fontSize: "13px", color: "#9ca3af", marginTop: "16px" }}>Florida Statute §194.011 · TRIM Notice VAB Petition · Mailed Filing</p>
        </section>

        <footer style={{ borderTop: "1px solid #e5e7eb", padding: "32px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ fontSize: "14px", color: "#9ca3af" }}>© 2026 TaxAppeal USA · <Link href="/florida" style={{ color: "#9ca3af" }}>Florida Property Tax Appeal</Link> · <Link href="/terms" style={{ color: "#9ca3af" }}>Terms</Link> · <Link href="/privacy" style={{ color: "#9ca3af" }}>Privacy</Link></div>
          <div style={{ fontSize: "13px", color: "#9ca3af" }}>Serving {city.name}, {city.county} County, Florida</div>
        </footer>
      </div>
    </>
  );
}
