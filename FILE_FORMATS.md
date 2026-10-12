# File Format Specifications

This document provides detailed specifications for all file formats supported by BellePoule Modern, including parsing rules, error handling, and best practices.

## 📄 Table of Contents

1. [FFF File Format](#fff-file-format-ffe-federation-franaise-descrime)
2. [CSV Import/Export Format](#csv-importexport-format)
3. [XML BellePoule Format](#xml-bellepoule-format)
4. [Common Errors and Solutions](#common-errors-and-solutions)

## 🇫🇷 FFF File Format (FFE - Fédération Française d'Escrime)

The FFF format is the standard used by the French Fencing Federation for fencer registration and rankings.

### Standard FFF Format

**File Extensions**: `.fff`, `.csv`

**Structure**: Semi-colon delimited text file with optional header

```
NOM;PRENOM;SEXE;DATE_NAISSANCE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT
```

### Field Specifications

| Position | Field Name | Description | Format | Required | Example |
|----------|------------|-------------|--------|----------|---------|
| 1 | NOM | Last name | Text (UPPERCASE) | Yes | `DUPONT` |
| 2 | PRENOM | First name | Text (Title Case) | Yes | `Jean` |
| 3 | SEXE | Gender | M/F/MALE/FEMALE | Yes | `M` |
| 4 | DATE_NAISSANCE | Birth date | DD/MM/YYYY or YYYY-MM-DD | No | `15/03/1995` |
| 5 | NATION | Nationality | 3-letter code | No | `FRA` |
| 6 | LIGUE | Regional league | Text | No | `Île-de-France` |
| 7 | CLUB | Club name | Text | No | `Paris Escrime` |
| 8 | LICENCE | License number | Alphanumeric | No | `12345678` |
| 9 | CLASSEMENT | Ranking | Integer | No | `12` |

### Encoding and Character Support

- **Primary Encoding**: UTF-8 (recommended)
- **Legacy Support**: ISO-8859-1 (Latin-1)
- **BOM Handling**: UTF-8 BOM automatically removed
- **Special Characters**: Accents, spaces, hyphens supported in names

### Examples

#### Standard FFF File
```
FFF;UTF8;X
NOM;PRENOM;SEXE;DATE_NAISSANCE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT
DUPONT;Jean;M;15/03/1995;FRA;Île-de-France;Paris Escrime;12345678;12
MARTIN;Marie;F;22/07/1998;FRA;Provence;Marseille Club;87654321;8
BERNARD;Pierre;M;10/11/2000;FRA;Bretagne;Rennes Club;55556666;25
DURAND;Sophie;F;05/02/1997;FRA;Rhône-Alpes;Lyon Club;99998888;15
```

#### Mixed Format (Commas in Names)
```
DUPONT,Jean,15/03/1995,M,FRA,,12345678,ÎLE-DE-FRANCE,PARIS ESCRIME,12
MARTIN,MARIE,22/07/1998,F,FRA,,87654321,PROVENCE,MARSEILLE CLUB,8
```

### Gender Field Values

| Input | Interpreted As | Description |
|-------|----------------|-------------|
| `M`, `H`, `HOMME`, `MALE`, `MASCULIN` | MALE | Male/Masculin |
| `F`, `FEMME`, `FEMALE`, `FEMININ`, `DAME`, `D` | FEMALE | Female/Féminin |
| Empty/invalid | MIXED | Unknown/Default |

### Date Format Support

| Format | Example | Support |
|--------|---------|---------|
| `DD/MM/YYYY` | `15/03/1995` | ✅ Primary |
| `DD-MM-YYYY` | `15-03-1995` | ✅ Supported |
| `YYYY/MM/DD` | `1995/03/15` | ✅ Supported |
| `YYYY-MM-DD` | `1995-03-15` | ✅ Supported |
| `YYYY/MM/DD` | `1995/3/5` | ✅ Supported |
| Invalid | `15-1995-03` | ❌ Rejected |

### Advanced Mixed Formats

BellePoule Modern supports complex mixed formats where commas appear in name fields:

#### Format 1: Comma-separated personal info, semicolon-separated structured info
```
Format: NOM,PRENOM,DATE,SEXE,NATION;[champ vide];LICENCE,RÉGION,CLUB
```

**Example**:
```
LE-FLOCH,JEAN-BAPTISTE,15/03/1995,M,FRA,,12345678,ÎLE-DE-FRANCE,SAINT-CLOUD-L'VAL-D'HERBLAY,12
```

#### Format 2: Tab-separated with comma fields
```
Format: NOM,PRENOM,DATE,SEXE,NATION	TAB	LIGUE	TAB	CLUB	TAB	LICENCE
```

### Parsing Algorithm

1. **BOM Detection**: Remove UTF-8/UTF-16 BOM
2. **Format Detection**: Analyze first 10 lines for separator patterns
3. **Header Detection**: Identify and skip header lines
4. **Line Parsing**: Apply appropriate parsing strategy
5. **Validation**: Check required fields and data types
6. **Normalization**: Standardize formats and values

## 📊 CSV Import/Export Format

Comma-Separated Values format for easy integration with spreadsheets and other systems.

### Standard CSV Format

**File Extensions**: `.csv`

**Delimiter**: Detected automatically (comma, semicolon, or tab)

**Structure**:
```csv
LastName,FirstName,Gender,BirthDate,Nationality,League,Club,License,Ranking
DUPONT,Jean,M,15/03/1995,FRA,Île-de-France,Paris Escrime,12345678,12
MARTIN,Marie,F,22/07/1998,FRA,Provence,Marseille Club,87654321,8
```

### Export Formats

#### Full Competition Export
```csv
Rank,LastName,FirstName,Club,Victories,TouchesGiven,TouchesReceived,Indicator,Pool,VictoryRate
1,MOREAU,Luc,Paris Escrime,5,25,5,20.00,A,100.00%
2,MARTIN,Marie,Marseille Club,4,22,8,14.00,B,80.00%
3,DUPONT,Jean,Paris Escrime,3,21,12,9.00,A,60.00%
```

#### Pool Results Export
```csv
Pool,Position,LastName,FirstName,Club,V,M,TD,TR,Indicator
1,1,MOREAU,Luc,Paris Escrime,5,0,25,5,20.00
1,2,MARTIN,Marie,Marseille Club,4,1,22,8,14.00
1,3,DUPONT,Jean,Paris Escrime,3,2,21,12,9.00
```

#### Match Results Export
```csv
Round,Piste,FencerA,ClubA,ScoreA,FencerB,ClubB,ScoreB,Status,Duration
Pool1,A,MARTIN,Marseille Club,5,LEROY,Toulouse Club,3,Complete,8:45
Pool1,B,MOREAU,Paris Escrime,4,ROBERT,Strasbourg Club,5,Complete,12:30
Tableau16,A,DUPONT,Paris Escrime,15,BERNARD,Lyon Club,12,Complete,15:20
```

### Import Variants

#### Minimal Format (Names Only)
```csv
LastName,FirstName
DUPONT,Jean
MARTIN,Marie
```

#### Extended Format (Additional Fields)
```csv
LastName,FirstName,Gender,BirthDate,Nationality,League,Club,License,Ranking,Email,Phone
DUPONT,Jean,M,15/03/1995,FRA,Île-de-France,Paris Escrime,12345678,12,jean.dupont@email.com,0612345678
```

## 🏷️ XML BellePoule Format

XML format compatible with the original BellePoule software and other fencing tournament systems.

### Document Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Competition Nom="Competition Name" 
              Arme="Weapon" 
              Date="YYYY-MM-DD" 
              Lieu="Location">
  <!-- Phases and matches -->
</Competition>
```

### Root Element Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `Nom` | String | Yes | Competition name |
| `Arme` | String | Yes | Weapon (Épée/Fleuret/Sabre) |
| `Date` | Date | Yes | Competition date (YYYY-MM-DD) |
| `Lieu` | String | No | Competition location |

### Fencer Elements

#### Individual Fencer
```xml
<Tireur Nom="DUPONT" 
        Prenom="Jean" 
        Sexe="M" 
        Nation="FRA"
        Ligue="Île-de-France"
        Club="Paris Escrime"
        Licence="12345678"
        Classement="12"/>
```

#### Fencer Field Specifications

| Attribute | Type | Required | Values |
|-----------|------|----------|--------|
| `Nom` | String | Yes | Last name |
| `Prenom` | String | Yes | First name |
| `Sexe` | String | No | M/F (Male/Female) |
| `Nation` | String | No | 3-letter country code |
| `Ligue` | String | No | Regional league |
| `Club` | String | No | Club name |
| `Licence` | String | No | License number |
| `Classement` | Integer | No | Ranking |

### Phase Elements

#### Pool Phase
```xml
<Phase Nom="Poules" 
       Tour="1" 
       NbTireurs="18" 
       NbPoules="3">
  
  <Poule Numero="1">
    <Tireur Id="1" Nom="DUPONT" Prenom="Jean" />
    <Tireur Id="2" Nom="MARTIN" Prenom="Marie" />
    <!-- More fencers -->
    
    <Match Id="1">
      <TireurA Id="1" Score="5"/>
      <TireurB Id="2" Score="3"/>
      <Statut>Termine</Statut>
    </Match>
  </Poule>
</Phase>
```

#### Tableau Phase
```xml
<Phase Nom="Tableau" 
       Type="Direct Elimination" 
       Qualifies="18">
  
  <Match Id="32" Round="16" Piste="A">
    <TireurA Id="1" Nom="MOREAU" Prenom="Luc" Score="15"/>
    <TireurB Id="16" Nom="ROBERT" Prenom="Thomas" Score="12"/>
    <Vainqueur Id="1"/>
    <Statut>Termine</Statut>
    <Duree>00:15:30</Duree>
  </Match>
</Phase>
```

### Match Elements

#### Complete Match Record
```xml
<Match Id="45" 
       Round="Quarts" 
       Piste="B" 
       DateDebut="2024-03-15T14:30:00"
       DateFin="2024-03-15T14:45:30">
  
  <TireurA Id="1" Nom="MOREAU" Prenom="Luc"/>
  <TireurB Id="8" Nom="LEROY" Prenom="Sophie"/>
  
  <ScoreA>15</ScoreA>
  <ScoreB>12</ScoreB>
  
  <Vainqueur Id="1"/>
  
  <Statut>Termine</Statut>
  <Arbitre>DURAND Paul</Arbitre>
  
  <Details>
    <CartonsJoueurA>
      <Carton Type="Jaune" Temps="00:08:15"/>
    </CartonsJoueurA>
    <CartonsJoueurB>
      <Carton Type="Rouge" Temps="00:12:30"/>
    </CartonsJoueurB>
  </Details>
</Match>
```

### Special Cases

#### Bye/Exempt Match
```xml
<Match Id="1" Round="16" Piste="A">
  <TireurA Id="1" Nom="DUPONT" Prenom="Jean"/>
  <TireurB Bye="true"/>
  <Vainqueur Id="1"/>
  <Statut>Exempt</Statut>
</Match>
```

#### Withdrawal/Forfeit
```xml
<Match Id="2" Round="16" Piste="B">
  <TireurA Id="2" Nom="MARTIN" Prenom="Marie" Score="0"/>
  <TireurB Id="15" Nom="BERNARD" Prenom="Pierre" Score="5"/>
  <Vainqueur Id="15"/>
  <Statut>Forfait</Statut>
  <Forfait Par="MARTIN"/>
</Match>
```

### Export Examples

#### Complete Competition Export
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Competition Nom="Championnat Régional Épée" 
              Arme="Épée" 
              Date="2024-03-15" 
              Lieu="Paris">
  
  <Tireurs>
    <Tireur Id="1" Nom="MOREAU" Prenom="Luc" Sexe="M" 
            Nation="FRA" Club="Paris Escrime" 
            Licence="12345678" Classement="12"/>
    <!-- More fencers -->
  </Tireurs>
  
  <Phases>
    <Phase Nom="Poules" Tour="1">
      <Poule Numero="1">
        <Match Id="1">
          <TireurA Id="1" Score="5"/>
          <TireurB Id="2" Score="3"/>
          <Vainqueur Id="1"/>
          <Statut>Termine</Statut>
        </Match>
        <!-- More matches -->
      </Poule>
    </Phase>
    
    <Phase Nom="Tableau">
      <Match Id="32" Round="16" Piste="A">
        <TireurA Id="1" Score="15"/>
        <TireurB Id="16" Score="12"/>
        <Vainqueur Id="1"/>
        <Statut>Termine</Statut>
      </Match>
    </Phase>
  </Phases>
</Competition>
```

## ❌ Common Errors and Solutions

### FFF File Issues

#### Error: "Names with commas not recognized"
**Problem**: FFF files with comma-separated names cause parsing errors.

**Example Problem**:
```
LE-FLOCH,JEAN-BAPTISTE,15/03/1995,M,FRA,,12345678,ÎLE-DE-FRANCE,SAINT-CLOUD,12
```

**Solution**: BellePoule Modern automatically detects mixed formats. If issues persist:
1. Use proper quoting: `"LE-FLOCH","JEAN-BAPTISTE"...`
2. Or convert to standard format:
```
LE-FLOCH;JEAN-BAPTISTE;M;15/03/1995;FRA;ÎLE-DE-FRANCE;SAINT-CLOUD;12345678;12
```

#### Error: "Invalid date format"
**Problem**: Date not in recognized format.

**Problematic Examples**:
```
1995-03-15 (wrong order)
15.03.1995 (wrong separator)
15-MAR-1995 (text month)
```

**Solution**: Convert to supported format:
```
15/03/1995  (recommended)
15-03-1995  (also supported)
1995/03/15  (alternative)
```

#### Error: "Special characters lost"
**Problem**: Accented characters corrupted.

**Problematic**:
- File saved as ASCII instead of UTF-8
- BOM interfering with parsing

**Solution**:
1. Ensure file saved as UTF-8
2. Remove BOM if present
3. Verify with text editor showing encoding

### CSV Import Issues

#### Error: "Delimiter not detected"
**Problem**: Wrong delimiter auto-detection.

**Solutions**:
1. Specify delimiter manually
2. Use consistent delimiters throughout file
3. Add header row to help detection

#### Error: "Empty rows detected"
**Problem**: Blank lines in file.

**Solution**: Remove empty lines or ensure consistent formatting.

### XML Import Issues

#### Error: "Malformed XML"
**Common Causes**:
- Unclosed tags
- Improper nesting
- Invalid characters in content
- Incorrect encoding declaration

**Example Problems**:
```xml
<!-- Unclosed tag -->
<Tireur Nom="DUPONT">

<!-- Improper nesting -->
<Competition><Tireur></Competition></Tireur>

<!-- Invalid characters -->
<Nom>DUPONT & SONS</Nom>  <!-- Should be &amp; -->
```

**Solutions**:
1. Use XML validator
2. Proper escape special characters: `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`
3. Ensure proper tag closure

#### Error: "Required attributes missing"
**Problem**: Essential competition information missing.

**Solution**: Add required attributes:
```xml
<!-- Missing required attributes -->
<Competition>  <!-- Wrong -->

<!-- Correct format -->
<Competition Nom="Tournament Name" Arme="Épée" Date="2024-03-15">
```

### Encoding Issues

#### Problem: "Non-ASCII characters broken"

**Detection**: Characters like é, è, à display as � or ???

**Solutions**:
1. **Check file encoding**: Open in advanced text editor
2. **Convert to UTF-8**: Use file conversion tools
3. **Remove BOM**: Some systems struggle with BOM
4. **Validate encoding**: Use tools like `file` command

**Linux/Mac commands**:
```bash
# Check encoding
file -I filename.csv

# Convert to UTF-8
iconv -f ISO-8859-1 -t UTF-8 filename.csv > filename_utf8.csv

# Remove BOM
sed -i '1s/^\xEF\xBB\xBF//' filename.csv
```

### Performance Issues

#### Large File Handling

**Problem**: Files >10,000 fencers cause slowdown

**Solutions**:
1. **Split files**: Divide into smaller chunks
2. **Batch import**: Import in stages
3. **Optimize format**: Use minimal required fields
4. **Check system resources**: Ensure adequate RAM

### Validation Rules

#### Field Validation

| Field | Validation | Error Message |
|-------|------------|----------------|
| Last Name | Required, non-empty | "Last name required" |
| First Name | Required, non-empty | "First name required" |
| Gender | M/F/MALE/FEMALE/empty | "Invalid gender" |
| Birth Date | Valid date or empty | "Invalid date format" |
| Ranking | Positive integer or empty | "Invalid ranking" |
| License | Alphanumeric or empty | "Invalid license format" |

#### Business Rules

1. **Duplicate Detection**: Same name + birth date = warning
2. **License Uniqueness**: License numbers must be unique
3. **Ranking Range**: Rankings should be positive
4. **Date Logic**: Birth date should be in the past
5. **Country Codes**: 3-letter format preferred

### Troubleshooting Checklist

#### Before Import
- [ ] File encoding is UTF-8
- [ ] Consistent delimiter usage
- [ ] Header row correctly formatted
- [ ] No special characters in delimiters
- [ ] Date formats consistent
- [ ] Required fields present

#### After Import
- [ ] Check import log for warnings/errors
- [ ] Verify fencer count
- [ ] Spot-check special cases (names with commas)
- [ ] Validate rankings and clubs
- [ ] Check for duplicate entries

### Best Practices

#### File Preparation
1. **Clean data**: Remove extra spaces and formatting
2. **Standardize**: Use consistent naming conventions
3. **Validate**: Check for obvious errors before import
4. **Backup**: Keep original files
5. **Test**: Import small sample first

#### Data Quality
1. **Names**: Use proper case, avoid all-caps for first names
2. **Dates**: Use consistent format throughout
3. **Codes**: Use standard country/league codes
4. **Completeness**: Fill as many fields as possible
5. **Consistency**: Same club names across files

#### File Management
1. **Naming**: Use descriptive filenames
2. **Versioning**: Keep track of file versions
3. **Documentation**: Note format specifics
4. **Archiving**: Store processed files
5. **Backup**: Regular backup schedules

---

**📚 Need more help?** Check our [Troubleshooting Guide](TROUBLESHOOTING.md) for additional solutions, or contact support through the built-in bug reporter.